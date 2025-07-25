import "dotenv/config";
import { opt } from "./options";
import type { CharacterId, UserSession } from "@mp/game/server";
import {
  ctxUserSession,
  ctxTokenResolver,
  registerEncoderExtensions,
} from "@mp/game/server";
import { createPinoLogger } from "@mp/logger/pino";
import type { WebSocket } from "@mp/ws/server";
import { WebSocketServer } from "@mp/ws/server";
import { type } from "@mp/validate";
import type { IncomingMessage } from "http";
import { upsertMapSet } from "@mp/std";
import createCors from "cors";
import express from "express";
import http from "http";
import proxy from "express-http-proxy";
import { metricsMiddleware } from "./metrics-middleware";
import {
  MetricsGague,
  MetricsHistogram,
  MetricsRegistry,
  collectDefaultMetrics,
  exponentialBuckets,
} from "@mp/telemetry/prom";
import type { FlushResult } from "@mp/sync";
import { flushResultEncoding, syncMessageEncoding } from "@mp/sync";
import type { ClientId } from "./client-id";
import { getClientId } from "./client-id";
import {
  BinaryEventTransceiver,
  createEventRouterReceiver,
} from "@mp/event-router";
import { ctxClientId, gatewayRouter } from "./router";
import { ImmutableInjectionContainer } from "@mp/ioc";
import { logEventTransceiverResult } from "./event-transceiver-logger";
import { createTokenResolver } from "@mp/auth/server";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting gateway...`);

const sockets = new Map<SocketType, Set<WebSocket>>();
const userSessions = new Map<ClientId, UserSession>();
const metricsRegister = new MetricsRegistry();

collectDefaultMetrics({ register: metricsRegister });

const webServer = express()
  .set("trust proxy", opt.trustProxy)
  .use("/health", (req, res) => res.send("OK"))
  .use(metricsMiddleware(metricsRegister))
  .use(createCors({ origin: opt.corsOrigin }))
  .use(opt.apiEndpointPath, proxy(opt.apiServiceUrl));

const httpServer = http.createServer(webServer);

const tokenResolver = createTokenResolver(opt.auth);

const wss = new WebSocketServer({
  path: opt.wsEndpointPath,
  server: httpServer,
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
});

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Gateway listening on ${opt.hostname}:${opt.port}`);
});

const eventTransceiver = new BinaryEventTransceiver({
  receive: createEventRouterReceiver(gatewayRouter),
});

const ioc = new ImmutableInjectionContainer().provide(
  ctxTokenResolver,
  tokenResolver,
);

wss.on("connection", (socket, request) => {
  socket.binaryType = "arraybuffer";
  const socketType = getSocketType(request);
  if (socketType instanceof type.errors) {
    logger.error(
      new Error("Unknown socket type", { cause: socketType.summary }),
    );
    return;
  }

  logger.info(`New ${socketType} connection established`);

  upsertMapSet(sockets, socketType, socket);

  const clientId = getClientId(socket);
  userSessions.set(clientId, { id: clientId });

  socket.on("close", () => {
    logger.info(`${socketType} connection closed`);
    sockets.get(socketType)?.delete(socket);
    userSessions.delete(clientId);
  });

  socket.on("message", (data: ArrayBuffer) => {
    const flushResult = flushResultEncoding<CharacterId>().decode(data);
    if (flushResult.isOk()) {
      flushGameState(flushResult.value);
      return;
    }

    const eventResult = eventTransceiver.handleMessage(data, () => {
      const session = userSessions.get(clientId);
      return ioc
        .provide(ctxClientId, clientId)
        .provideIfDefined(ctxUserSession, session);
    });

    if (eventResult) {
      logEventTransceiverResult(logger, eventResult);
      return;
    }
  });

  socket.on("error", (err) => {
    logger.error(err, `Error in ${socketType} connection`);
  });
});

function flushGameState([flushResult, time]: [FlushResult<CharacterId>, Date]) {
  const gameClientSockets = sockets.get("game-client");
  if (!gameClientSockets) {
    return;
  }

  const { clientPatches, clientEvents } = flushResult;

  for (const socket of gameClientSockets) {
    const player = userSessions.get(getClientId(socket))?.player;
    if (!player) {
      // Socket not authenticated, should not have access to game state, also we don't know what game state to send.
      continue;
    }

    const patch = clientPatches.get(player.characterId);
    const events = clientEvents.get(player.characterId);
    if (patch || events) {
      const encodedPatch = syncMessageEncoding.encode([patch, time, events]);
      gameStatePatchSizeHistogram.observe(encodedPatch.byteLength);
      socket.send(encodedPatch);
    }
  }
}

const SocketType = type.enumerated("game-client", "game-server");
type SocketType = typeof SocketType.infer;

function getSearchParams(path = ""): URLSearchParams {
  return new URL(path, "http://localhost").searchParams;
}

function getSocketType(req: IncomingMessage) {
  const typeParam = getSearchParams(req.url).get("type") ?? "game-client";
  return SocketType(typeParam);
}

const gameStatePatchSizeHistogram = new MetricsHistogram({
  name: "game_state_flush_patch_size_bytes",
  help: "Size of the game state patch sent each server tick to clients in bytes",
  registers: [metricsRegister],
  buckets: exponentialBuckets(1, 2, 20),
});

const _userCountGague = new MetricsGague({
  name: "active_user_count",
  help: "Number of users currently connected",
  registers: [metricsRegister],
  collect() {
    this.set(
      new Set(
        userSessions
          .values()
          .flatMap((session) => (session.user ? [session.user.id] : [])),
      ).size,
    );
  },
});

const _clientCountGague = new MetricsGague({
  name: "active_client_count",
  help: "Number of active websocket connections",
  registers: [metricsRegister],
  collect() {
    this.set(sockets.get("game-client")?.size ?? 0);
  },
});
