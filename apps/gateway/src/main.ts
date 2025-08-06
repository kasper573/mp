import { createDbClient } from "@mp/db";
import type { AreaId } from "@mp/db/types";
import type { EventRouterMessage } from "@mp/event-router";
import {
  createEventInvoker,
  createProxyEventInvoker,
  QueuedEventInvoker,
  willRouterAcceptMessage,
} from "@mp/event-router";
import type { GameServerEventRouter } from "@mp/game-service";
import type { SyncMessageWithRecipient, UserSession } from "@mp/game-shared";
import {
  eventMessageEncoding,
  eventWithSessionEncoding,
  registerEncoderExtensions,
  syncMessageEncoding,
  syncMessageWithRecipientEncoding,
} from "@mp/game-shared";
import { InjectionContainer } from "@mp/ioc";
import { gatewayRoles, playerRoles } from "@mp/keycloak";
import { createPinoLogger } from "@mp/logger/pino";
import type { AccessToken, UserId } from "@mp/oauth";
import { createTokenResolver } from "@mp/oauth/server";
import { computed, effect, Signal } from "@mp/state";
import type { Branded } from "@mp/std";
import { arrayShallowEquals, createShortId, debounce, dedupe } from "@mp/std";
import { SyncMap } from "@mp/sync";
import {
  collectDefaultMetrics,
  exponentialBuckets,
  MetricsGague,
  MetricsHistogram,
  metricsMiddleware,
} from "@mp/telemetry/prom";
import type { WebSocket, WebSocketServerOptions } from "@mp/ws/server";
import { WebSocketServer } from "@mp/ws/server";
import "dotenv/config";
import express from "express";
import type { IncomingMessage } from "http";
import http from "http";
import {
  ctxDbClient,
  ctxGameEventClient,
  ctxUserSession,
  ctxUserSessionSignal,
} from "./context";
import { saveOnlineCharacters } from "./db-operations";
import { opt } from "./options";
import { gatewayRouter } from "./router";

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
  .use("/health", (req, res) => res.send("OK"))
  .use(metricsMiddleware());

const httpServer = http.createServer(webServer);

const db = createDbClient(opt.databaseConnectionString);
db.$client.on("error", (err) => logger.error(err, "Database error"));

const resolveAccessToken = createTokenResolver({
  ...opt.auth,
  bypassUserRoles: playerRoles,
});

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

const ioc = new InjectionContainer().provide(ctxDbClient, db);

const saveOnlineCharactersDeduped = dedupe(
  debounce(saveOnlineCharacters(db, logger), 100),
  arrayShallowEquals,
);

effect(() => saveOnlineCharactersDeduped(onlineCharacterIds.value));

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
      return setupGameServerSocket(socket, info.areaId);
    default:
  }
});

const gatewayUser = {
  id: "gateway" as UserId,
  name: "Gateway",
  roles: new Set([gatewayRoles.gameServiceBroadcast]),
};

function setupGameServerSocket(socket: WebSocket, areaId: AreaId) {
  gameServiceSockets.add(socket);

  const session: UserSession = { id: createShortId(), user: gatewayUser };

  logger.info(`Game service connected`);

  socket.on("close", () => {
    logger.info(`Game service disconnected`);
    gameServiceSockets.delete(socket);
  });

  socket.on("message", (data: ArrayBuffer) => {
    const message = syncMessageWithRecipientEncoding.decode(data);
    if (message.isOk()) {
      sendSyncMessageToRecipient(message.value, areaId);
      return;
    }

    // When the gateway receives an event from a game service,
    // that means the game service wants to broadcast this event to all other game servics.
    const event = eventMessageEncoding.decode(data);
    if (event.isOk()) {
      const gatewayEvent = eventWithSessionEncoding.encode({
        event: event.value,
        session,
      });
      for (const gameServiceSocket of gameServiceSockets) {
        if (gameServiceSocket !== socket) {
          gameServiceSocket.send(gatewayEvent);
        }
      }
      return;
    }

    logger.warn(
      { size: data.byteLength },
      `Received unknown message from game service. ` +
        `Message decode error: ${message.error}. Event decode error: ${event.error}`,
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

  const broadcastClient = createProxyEventInvoker<GameServerEventRouter>(
    broadcastEventToGameServices,
  );

  socket.on("close", () => {
    logger.info(`Game client ${session.value.id} disconnected`);
    gameClientSockets.delete(session.value.id);
    userSessions.delete(session.value.id);
  });

  socket.on("message", (data: ArrayBuffer) => {
    if (data.byteLength > maxMessageSizeFromGameClient) {
      logger.warn(
        { size: data.byteLength },
        `Received too large message from game client ${session.value.id}. Ignoring message and closing connection.`,
      );
      socket.close(1009, "Message too large");
      return;
    }
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

function sendSyncMessageToRecipient(
  [msg, recipientId]: SyncMessageWithRecipient,
  originatingGameServiceAreaId: AreaId,
) {
  for (const [clientId, socket] of gameClientSockets.entries()) {
    const socketSession = userSessions.get(clientId)?.value;
    if (socketSession?.characterId === recipientId) {
      const encodedPatch = syncMessageEncoding.encode(msg);
      metrics.syncMessageSizeSize.observe(
        { areaId: originatingGameServiceAreaId },
        encodedPatch.byteLength,
      );
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
  const areaId = (searchParams.get("gameServiceAreaId") ?? undefined) as
    | AreaId
    | undefined;
  if (secret && areaId) {
    return { type: "game-service", secret, areaId } as const;
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

// In practice most game client inputs should be ~100B,
// but we add some margin to avoid accidentally disconnecting non malicious clients.
// This safety limit just exist to prevent abuse.
const maxMessageSizeFromGameClient = 500;

function wssConfig(): WebSocketServerOptions {
  return {
    // Arbitrary safety limit to never send too much data,
    // however, in practice we will limit game client sockets to a much smaller size manually.
    maxPayload: 50_000,
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
  syncMessageSizeSize: new MetricsHistogram({
    name: "gateway_to_game_client_sync_message_byte_size",
    help: "This measures the actual data send over the internet to players",
    buckets: exponentialBuckets(1, 2, 20),
    labelNames: ["areaId"],
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
  | Readonly<{ type: "game-service"; secret?: string; areaId: AreaId }>
  | Readonly<{ type: "unknown" }>;
