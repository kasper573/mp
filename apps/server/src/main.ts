import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { consoleLoggerHandler, Logger } from "@mp/logger";
import express from "express";
import createCors from "cors";
import { createAuthServer } from "@mp/auth/server";
import { createPatchStateMachine, flushPatches } from "@mp/sync";
import { Ticker } from "@mp/time";
import { collectDefaultMetrics, MetricsRegistry } from "@mp/telemetry/prom";
import type { AuthToken, UserIdentity } from "@mp/auth";
import { createWSSWithHandshake } from "@mp/ws/server";
import { InjectionContainer } from "@mp/ioc";
import { ctxSessionId, ctxUserIdentity } from "@mp/game";
import { RateLimiter } from "@mp/rate-limiter";
import { createDBClient } from "@mp/db/server";
import { uuid, type LocalFile } from "@mp/std";
import type { ClientId } from "@mp/sync";
import { ctxGlobalMiddleware, ctxRpcErrorFormatter } from "@mp/game";
import type { GameState, SessionId } from "@mp/game";
import {
  ctxAreaFileUrlResolver,
  ctxAreaLookup,
  ClientRegistry,
  movementBehavior,
  npcSpawnBehavior,
  combatBehavior,
  characterRemoveBehavior,
  CharacterService,
  ctxCharacterService,
  npcAIBehavior,
  ctxNpcService,
  ctxGameStateMachine,
  deriveClientVisibility,
  NPCService,
  GameService,
} from "@mp/game";
import { collectProcessMetrics } from "./metrics/process";
import { metricsMiddleware } from "./express/metrics-middleware";
import { collectUserMetrics } from "./metrics/user";
import { createTickMetricsObserver } from "./metrics/tick";
import { createExpressLogger } from "./express/logger";
import { collectPathFindingMetrics } from "./metrics/path-finding";
import { opt } from "./options";
import { errorFormatter } from "./etc/error-formatter";
import { rateLimiterMiddleware } from "./etc/rate-limiter-middleware";
import { serverFileToPublicUrl } from "./etc/server-file-to-public-url";
import { rootRouter } from "./router";
import {
  clientViewDistance,
  registerSyncExtensions,
  webSocketTokenParam,
} from "./shared";
import { customFileTypes } from "./etc/custom-filetypes";
import { acceptRpcViaWebSockets } from "./etc/rpc-wss";
import { loadAreas } from "./etc/load-areas";

registerSyncExtensions();

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));
logger.info(`Server started with options`, opt);

RateLimiter.enabled = opt.rateLimit;

const clients = new ClientRegistry();
const metrics = new MetricsRegistry();
const auth = createAuthServer(opt.auth);
const db = createDBClient(opt.databaseUrl);

db.$client.on("error", logger.error);

const webServer = express()
  .set("trust proxy", opt.trustProxy)
  .use(metricsMiddleware(metrics))
  .use("/health", (req, res) => res.send("OK"))
  // the above is intentionally placed before logger since it's so verbose and unnecessary to log
  .use(createExpressLogger(logger))
  .use(createCors({ origin: opt.corsOrigin }))
  .use(
    opt.publicPath,
    express.static(opt.publicDir, {
      maxAge: opt.publicMaxAge * 1000,
      setHeaders: (res, filePath) => {
        for (const fileType of customFileTypes) {
          if (filePath.endsWith(fileType.extension)) {
            res.setHeader("Content-Type", fileType.contentType);
            break;
          }
        }
      },
    }),
  );

const httpServer = http.createServer(webServer);

const wsHandshakeLimiter = new RateLimiter({
  points: 10,
  duration: 30,
});

const areas = await loadAreas(path.resolve(opt.publicDir, "areas"));

const webSockets = new Map<ClientId, WebSocket>();
const socketInfo = new Map<
  WebSocket,
  { user: UserIdentity; sessionId: SessionId }
>();

const wss = createWSSWithHandshake<UserIdentity, ClientId>({
  httpServer,
  path: opt.wsEndpointPath,
  createSocketId: () => uuid() as ClientId,
  onError: logger.error,
  async handshake(clientId, req) {
    // .url is in fact a path, so baseUrl does not matter
    const url = req.url ? new URL(req.url, "http://localhost") : undefined;
    const token = url?.searchParams.get(webSocketTokenParam);
    const result = await auth.verifyToken(token as AuthToken);
    return result.asyncAndThrough((user) =>
      wsHandshakeLimiter.consume(user.id),
    );
  },
  onConnection(socket, handshake) {
    const sessionId = String(handshake.id) as SessionId;
    socketInfo.set(socket, { user: handshake.payload, sessionId });
    clients.add(handshake.id, handshake.payload.id);
    webSockets.set(handshake.id, socket);
    socket.addEventListener("close", () => {
      clients.remove(handshake.id);
      webSockets.delete(handshake.id);
      socketInfo.delete(socket);
    });
  },
});

acceptRpcViaWebSockets({
  wss,
  onError: logger.error,
  router: rootRouter,
  createContext: (socket) => {
    const info = socketInfo.get(socket);
    if (info) {
      return ioc
        .provide(ctxSessionId, info.sessionId)
        .provide(ctxUserIdentity, info.user);
    }
    return ioc;
  },
});

const gameState = createPatchStateMachine<GameState>({
  initialState: { actors: {} },
  clientIds: () => webSockets.keys(),
  clientVisibility: deriveClientVisibility(
    clients,
    clientViewDistance.networkFogOfWarTileCount,
    areas,
  ),
});

const npcService = new NPCService(db);
const gameService = new GameService(db);

const persistTicker = new Ticker({
  onError: logger.error,
  interval: opt.persistInterval,
  middleware: () => gameService.persist(gameState),
});

const updateTicker = new Ticker({
  onError: logger.error,
  interval: opt.tickInterval,
  middleware: createTickMetricsObserver(metrics),
});

const characterService = new CharacterService(db, areas);

const ioc = new InjectionContainer()
  .provide(ctxGlobalMiddleware, rateLimiterMiddleware)
  .provide(ctxRpcErrorFormatter, errorFormatter)
  .provide(ctxNpcService, npcService)
  .provide(ctxCharacterService, characterService)
  .provide(ctxGameStateMachine, gameState)
  .provide(ctxAreaLookup, areas)
  .provide(ctxAreaFileUrlResolver, (id) =>
    serverFileToPublicUrl(`areas/${id}.tmj` as LocalFile),
  );

collectDefaultMetrics({ register: metrics });
collectProcessMetrics(metrics);
collectUserMetrics(metrics, clients, gameState);
collectPathFindingMetrics(metrics);

updateTicker.subscribe(npcAIBehavior(gameState, areas));
updateTicker.subscribe(movementBehavior(gameState, areas));
updateTicker.subscribe(npcSpawnBehavior(gameState, npcService, areas));
updateTicker.subscribe(combatBehavior(gameState));
updateTicker.subscribe(flushGameState);
characterRemoveBehavior(clients, gameState, logger, 5000);

clients.on(({ type, clientId, userId }) =>
  logger.info(`[ClientRegistry][${type}]`, { clientId, userId }),
);

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Server listening on ${opt.hostname}:${opt.port}`);
});

persistTicker.start();
updateTicker.start();

function flushGameState() {
  return flushPatches({
    state: gameState,
    getSender: (clientId) => {
      const socket = webSockets.get(clientId);
      return socket?.send.bind(socket);
    },
  });
}
