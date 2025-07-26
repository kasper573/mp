import "dotenv/config";
import { opt } from "./options";
import type {
  CharacterId,
  GameEventClient,
  UserSession,
} from "@mp/game/server";
import {
  ctxUserSession,
  ctxTokenResolver,
  registerEncoderExtensions,
  ctxGameEventClient,
  eventWithSessionEncoding,
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
import { flushResultEncoding, syncMessageEncoding } from "@mp/sync";
import {
  QueuedEventInvoker,
  createEventInvoker,
  createProxyEventInvoker,
  eventMessageEncoding,
} from "@mp/event-router";
import { ctxDbClient, gatewayRouter } from "./router";
import { ImmutableInjectionContainer } from "@mp/ioc";

import { createTokenResolver } from "@mp/auth/server";
import type { Branded } from "@mp/std";
import { createShortId } from "@mp/std";
import { createDbClient } from "@mp/db-client";
import type { AccessToken } from "@mp/auth";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting gateway...`);

type ClientId = Branded<string, "ClientId">;
const gameServiceSockets = new Set<WebSocket>();
const gameClientSockets = new Map<ClientId, WebSocket>();
const userSessions = new Map<ClientId, UserSession>();

collectDefaultMetrics();

const webServer = express()
  .set("trust proxy", opt.trustProxy)
  .use("/health", (req, res) => res.send("OK"))
  .use(metricsMiddleware())
  .use(createCors({ origin: opt.corsOrigin }))
  .use(opt.apiEndpointPath, proxy(opt.apiServiceUrl));

const httpServer = http.createServer(webServer);

const dbClient = createDbClient(opt.databaseConnectionString);

const tokenResolver = createTokenResolver(opt.auth);

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
  .provide(ctxTokenResolver, tokenResolver)
  .provide(ctxDbClient, dbClient);

wss.on("connection", (socket, request) => {
  socket.binaryType = "arraybuffer";
  const info = getRequestInfo(request);

  logger.info(`New ${info.type} connection established`);

  socket.on("error", (err) => {
    logger.error(err, `Error in ${info.type} connection`);
  });

  switch (info.type) {
    case "game-client":
      return setupGameClientSocket(info.clientId, socket);
    case "game-service":
      return setupGameServerSocket(socket);
    default:
  }
});

function setupGameServerSocket(socket: WebSocket) {
  gameServiceSockets.add(socket);

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
  });
}

function setupGameClientSocket(clientId: ClientId, socket: WebSocket) {
  const session: UserSession = { id: clientId };
  userSessions.set(clientId, session);
  gameClientSockets.set(clientId, socket);

  const gameServiceEventBroadcast: GameEventClient = createProxyEventInvoker(
    (event) => {
      const encoded = eventWithSessionEncoding.encode({ event, session });
      for (const socket of gameServiceSockets) {
        socket.send(encoded);
      }
    },
  );

  socket.on("close", () => {
    logger.info(`Game client ${clientId} disconnected`);
    gameClientSockets.delete(clientId);
    userSessions.delete(clientId);
  });

  socket.on("message", (data: ArrayBuffer) => {
    const result = eventMessageEncoding.decode(data);
    if (result.isOk()) {
      gatewayEventInvoker.addEvent(
        result.value,
        ioc
          .provideIfDefined(ctxUserSession, session)
          .provide(ctxGameEventClient, gameServiceEventBroadcast),
      );
    }
  });
}

function flushGameState([flushResult, time]: [FlushResult<CharacterId>, Date]) {
  const { clientPatches, clientEvents } = flushResult;

  for (const [clientId, socket] of gameClientSockets.entries()) {
    const characterId = userSessions.get(clientId)?.characterId;
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
      const result = await tokenResolver(info.accessToken);
      if (result.isOk()) {
        return cb(true);
      }
      return cb(false, 401, result.error);
    }
    default:
      return cb(false, 400, "Bad Request: Unknown connection type");
  }
}

function getRequestInfo(req: IncomingMessage) {
  if (!req.url) {
    return { type: "unknown" } as const;
  }
  const { searchParams } = new URL(req.url, "http://localhost");
  const secret = searchParams.get("gameServiceSecret") ?? undefined;
  if (secret) {
    return { type: "game-service", secret } as const;
  }
  const accessToken = (searchParams.get("accessToken") ?? undefined) as
    | AccessToken
    | undefined;

  let clientId = Reflect.get(req, "clientId") as ClientId | undefined;
  if (!clientId) {
    clientId = createShortId() as ClientId;
    Reflect.set(req, "clientId", clientId);
  }

  return { type: "game-client", clientId, accessToken } as const;
}

function wssConfig(): WebSocketServerOptions {
  return {
    maxPayload: 5000,
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
            .flatMap((session) => (session.user ? [session.user.id] : [])),
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
