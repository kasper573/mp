import "dotenv/config";
import { opt } from "./options";
import type {
  CharacterId,
  GameEventClient,
  UserSession,
} from "@mp/game/server";
import {
  ctxTokenResolver,
  registerEncoderExtensions,
  ctxGameEventClient,
  eventWithSessionEncoding,
  ctxUserSession,
} from "@mp/game/server";
import { createPinoLogger } from "@mp/logger/pino";
import type { WebSocket, WebSocketServerOptions } from "@mp/ws/server";
import { WebSocketServer } from "@mp/ws/server";
import createCors from "cors";
import express from "express";
import type { IncomingMessage } from "http";
import http from "http";
import proxy from "express-http-proxy";
import {
  MetricsGague,
  MetricsHistogram,
  collectDefaultMetrics,
  exponentialBuckets,
  metricsMiddleware,
} from "@mp/telemetry/prom";
import type { FlushResult } from "@mp/sync";
import { flushResultEncoding, SyncMap, syncMessageEncoding } from "@mp/sync";
import type { EventRouterMessage } from "@mp/event-router";
import {
  QueuedEventInvoker,
  createEventInvoker,
  createProxyEventInvoker,
  eventMessageEncoding,
  willRouterAcceptMessage,
} from "@mp/event-router";
import { ctxDbClient, ctxUserSessionSignal, gatewayRouter } from "./router";
import { ImmutableInjectionContainer } from "@mp/ioc";
import { createTokenResolver } from "@mp/auth/server";
import type { Branded } from "@mp/std";
import { arrayShallowEquals, createShortId, dedupe } from "@mp/std";
import { createDbClient } from "@mp/db-client";
import type { AccessToken } from "@mp/auth";
import { saveOnlineCharacters } from "./db-operations";
import { computed, Signal } from "@mp/state";
import { effect } from "@mp/state";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting gateway...`);

type ClientId = Branded<string, "ClientId">;
const gameServiceSockets = new Set<WebSocket>();
const gameClientSockets = new Map<ClientId, WebSocket>();
const userSessions = new SyncMap<ClientId, Signal<UserSession<ClientId>>>();

const onlineCharacterIds = computed(() => [
  ...new Set(
    userSessions
      .values()
      .map((session) => session.value.characterId)
      .filter((id) => id !== undefined),
  ),
]);

collectDefaultMetrics();

const webServer = express()
  .set("trust proxy", opt.trustProxy)
  .use("/health", (req, res) => res.send("OK"))
  .use(metricsMiddleware())
  .use(createCors({ origin: opt.corsOrigin }))
  .use(opt.apiEndpointPath, proxy(opt.apiServiceUrl));

const httpServer = http.createServer(webServer);

const db = createDbClient(opt.databaseConnectionString);
db.$client.on("error", (err) => logger.error(err, "Database error"));

const resolveAccessToken = createTokenResolver(opt.auth);

const wss = new WebSocketServer({
  ...wssConfig(),
  path: opt.wsEndpointPath,
  server: httpServer,
  verifyClient: verifySocketConnection,
});

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Gateway listening on ${opt.hostname}:${opt.port}`);
});

const gatewayEventInvoker = new QueuedEventInvoker({
  invoke: createEventInvoker(gatewayRouter),
  logger,
});

const ioc = new ImmutableInjectionContainer()
  .provide(ctxTokenResolver, resolveAccessToken)
  .provide(ctxDbClient, db);

const saveOnlineCharactersDeduped = dedupe(
  saveOnlineCharacters,
  ([, ids1], [, ids2]) => arrayShallowEquals(ids1, ids2),
);

effect(() => void saveOnlineCharactersDeduped(db, onlineCharacterIds.value));

wss.on("connection", (socket, request) => {
  socket.binaryType = "arraybuffer";
  const info = getRequestInfo(request);

  socket.on("error", (err) => {
    logger.error(err, `Error in ${info.type} connection`);
  });

  switch (info.type) {
    case "game-client":
      return setupGameClientSocket(socket, info.session);
    case "game-service":
      return setupGameServerSocket(socket);
    default:
  }
});

function setupGameServerSocket(socket: WebSocket) {
  gameServiceSockets.add(socket);

  logger.info(`Game service connected`);

  socket.on("close", () => {
    logger.info(`Game service disconnected`);
    gameServiceSockets.delete(socket);
  });

  socket.on("message", (data: ArrayBuffer) => {
    const flushResult = flushResultEncoding<CharacterId>().decode(data);
    if (flushResult.isOk()) {
      flushGameState(flushResult.value);
      return;
    }

    // When the gateway receives an event from a game service,
    // that means the game service wants to broadcast this event to all other game servics.
    if (eventMessageEncoding.matches(data)) {
      for (const gameServiceSocket of gameServiceSockets) {
        if (gameServiceSocket !== socket) {
          gameServiceSocket.send(data);
        }
      }
      return;
    }

    logger.warn(
      { size: data.byteLength },
      "Received unknown message from game service",
    );
  });
}

function setupGameClientSocket(
  socket: WebSocket,
  session: Signal<UserSession<ClientId>>,
) {
  logger.info(session.value, `Game client connected`);
  userSessions.set(session.value.id, session);
  gameClientSockets.set(session.value.id, socket);

  function broadcastEventToGameServices(event: EventRouterMessage<unknown>) {
    const encoded = eventWithSessionEncoding.encode({
      event,
      session: session.value,
    });
    for (const socket of gameServiceSockets) {
      socket.send(encoded);
    }
  }

  const broadcastClient: GameEventClient = createProxyEventInvoker(
    broadcastEventToGameServices,
  );

  socket.on("close", () => {
    logger.info(`Game client ${session.value.id} disconnected`);
    gameClientSockets.delete(session.value.id);
    userSessions.delete(session.value.id);
  });

  socket.on("message", (data: ArrayBuffer) => {
    const result = eventMessageEncoding.decode(data);
    if (result.isOk()) {
      if (willRouterAcceptMessage(gatewayRouter, result.value)) {
        gatewayEventInvoker.addEvent(
          result.value,
          ioc
            .provide(ctxUserSession, session.value)
            .provide(ctxUserSessionSignal, session)
            .provide(ctxGameEventClient, broadcastClient),
        );
      } else {
        broadcastEventToGameServices(result.value);
      }
    }
  });
}

function flushGameState([flushResult, time]: [FlushResult<CharacterId>, Date]) {
  const { clientPatches, clientEvents } = flushResult;

  for (const [clientId, socket] of gameClientSockets.entries()) {
    const characterId = userSessions.get(clientId)?.value.characterId;
    if (characterId === undefined) {
      // Socket not authenticated, should not have access to game state, also we don't know what game state to send.
      continue;
    }

    const patch = clientPatches.get(characterId);
    const events = clientEvents.get(characterId);
    if (patch || events) {
      const encodedPatch = syncMessageEncoding.encode([patch, time, events]);
      metrics.gameStatePatchSize.observe(encodedPatch.byteLength);
      socket.send(encodedPatch);
    }
  }
}

async function verifySocketConnection(
  { req }: { req: IncomingMessage },
  cb: (result: boolean, code?: number, message?: string) => void,
) {
  const info = getRequestInfo(req);
  switch (info.type) {
    case "game-service":
      if (info.secret === opt.gameServiceSecret) {
        return cb(true);
      }
      return cb(false, 403, "Forbidden: Invalid game service secret");
    case "game-client": {
      const result = await resolveAccessToken(info.token);
      if (result.isOk()) {
        const { id, roles, name } = result.value;
        info.session.value = {
          ...info.session.value,
          user: { id, roles, name },
        };
        return cb(true);
      }
      return cb(false, 401, result.error);
    }
    default:
      return cb(false, 400, "Bad Request: Unknown connection type");
  }
}

function getRequestInfo(req: IncomingMessage): RequestInfo {
  if (!req.url) {
    return { type: "unknown" };
  }

  const { searchParams } = new URL(req.url ?? "", "http://localhost");
  const secret = searchParams.get("gameServiceSecret") ?? undefined;
  if (secret) {
    return { type: "game-service", secret } as const;
  }

  const token = (searchParams.get("accessToken") ?? undefined) as
    | AccessToken
    | undefined;

  let session = Reflect.get(req, "session") as
    | Signal<UserSession<ClientId>>
    | undefined;

  if (!session) {
    session = new Signal({ id: createShortId() as ClientId });
    Reflect.set(req, "session", session);
  }

  return { type: "game-client", session, token };
}

function wssConfig(): WebSocketServerOptions {
  return {
    maxPayload: 50000,
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7, // default level
        level: 6, // default is 3, max is 9
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024,
      },
      clientNoContextTakeover: true, // defaults to negotiated value.
      serverNoContextTakeover: true, // defaults to negotiated value.
      serverMaxWindowBits: 10, // defaults to negotiated value.
      concurrencyLimit: 10, // limits zlib concurrency for perf.
      threshold: 1024, // messages under this size won't be compressed.
    },
  };
}

const metrics = {
  gameStatePatchSize: new MetricsHistogram({
    name: "game_state_flush_patch_size_bytes",
    help: "Size of the game state patch sent each server tick to clients in bytes",
    buckets: exponentialBuckets(1, 2, 20),
  }),

  userCount: new MetricsGague({
    name: "active_user_count",
    help: "Number of users currently connected",
    collect() {
      this.set(
        new Set(
          userSessions
            .values()
            .flatMap((session) =>
              session.value.user ? [session.value.user.id] : [],
            ),
        ).size,
      );
    },
  }),

  clientCount: new MetricsGague({
    name: "active_client_count",
    help: "Number of active websocket connections",
    collect() {
      this.set(gameClientSockets.size);
    },
  }),
};

type RequestInfo =
  | Readonly<{
      type: "game-client";
      session: Signal<UserSession<ClientId>>;
      token?: AccessToken;
    }>
  | Readonly<{ type: "game-service"; secret?: string }>
  | Readonly<{ type: "unknown" }>;
