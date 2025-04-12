import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { consoleLoggerHandler, Logger } from "@mp/logger";
import express from "express";
import createCors from "cors";
import { createAuthServer } from "@mp/auth/server";
import { SyncServer, createPatchStateMachine } from "@mp/sync/server";
import { Ticker } from "@mp/time";
import { collectDefaultMetrics, MetricsRegistry } from "@mp/telemetry/prom";
import type { AuthToken, UserIdentity } from "@mp/auth";
import { createWSSWithHandshake } from "@mp/ws/server";
import { InjectionContainer } from "@mp/ioc";
import { ctxAuthServer, ctxRequest } from "@mp-modules/user";
import { RateLimiter } from "@mp/rate-limiter";
import {
  ctxGlobalMiddleware,
  ctxTrpcErrorFormatter,
  trpcExpress,
} from "@mp-modules/trpc/server";
import { createDBClient } from "@mp-modules/db";
import type { GameState, GameStateServer } from "@mp-modules/game/server";
import {
  ctxAreaFileUrlResolver,
  ctxAreaLookup,
  loadAreas,
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
} from "@mp-modules/game/server";
import { uuid, type LocalFile } from "@mp/std";
import type { ClientId } from "@mp/sync";
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
    express.static(opt.publicDir, { maxAge: opt.publicMaxAge * 1000 }),
  );

const httpServer = http.createServer(webServer);

const wsHandshakeLimiter = new RateLimiter({
  points: 10,
  duration: 30,
});

const areas = await loadAreas(path.resolve(opt.publicDir, "areas"));

const webSockets = new Map<ClientId, WebSocket>();

const wss = createWSSWithHandshake<UserIdentity, ClientId>({
  httpServer,
  path: opt.wsEndpointPath,
  onConnection: (socket, handshake) => {
    clients.add(handshake.id, handshake.payload.id);
    webSockets.set(handshake.id, socket);
    socket.addEventListener("close", () => {
      clients.remove(handshake.id);
      webSockets.delete(handshake.id);
    });
  },
  createSocketId: () => uuid() as ClientId,
  onError: (...args) => logger.error("[WSS]", ...args),
  async handshake(clientId, req) {
    // .url is in fact a path, so baseUrl does not matter
    const url = req.url ? new URL(req.url, "http://localhost") : undefined;
    const token = url?.searchParams.get(webSocketTokenParam);
    const result = await auth.verifyToken(token as AuthToken);
    return result.asyncAndThrough((user) =>
      wsHandshakeLimiter.consume(user.id),
    );
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

const syncServer: GameStateServer = new SyncServer({
  encoder: opt.syncPatchEncoder,
  state: gameState,
  onError: (...args) => logger.error("[SyncServer]", ...args),
  getSender: (clientId) => {
    const socket = webSockets.get(clientId);
    return socket?.send.bind(socket);
  },
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
  .provide(ctxAuthServer, auth)
  .provide(ctxGlobalMiddleware, rateLimiterMiddleware)
  .provide(ctxTrpcErrorFormatter, errorFormatter)
  .provide(ctxNpcService, npcService)
  .provide(ctxCharacterService, characterService)
  .provide(ctxGameStateMachine, gameState)
  .provide(ctxAreaLookup, areas)
  .provide(ctxAreaFileUrlResolver, (id) =>
    serverFileToPublicUrl(`areas/${id}.tmj` as LocalFile),
  );

webServer.use(
  opt.apiEndpointPath,
  trpcExpress.createExpressMiddleware({
    onError: ({ path, error }) => logger.error(error),
    router: rootRouter,
    createContext: ({ req }: { req: express.Request }) => ({
      ioc: ioc.provide(ctxRequest, req),
    }),
  }),
);

collectDefaultMetrics({ register: metrics });
collectProcessMetrics(metrics);
collectUserMetrics(metrics, clients, gameState);
collectPathFindingMetrics(metrics);

updateTicker.subscribe(npcAIBehavior(gameState, areas));
updateTicker.subscribe(movementBehavior(gameState, areas));
updateTicker.subscribe(npcSpawnBehavior(gameState, npcService, areas));
updateTicker.subscribe(combatBehavior(gameState));
updateTicker.subscribe(syncServer.flush);
characterRemoveBehavior(clients, gameState, logger, 5000);

clients.on(({ type, clientId, userId }) =>
  logger.info(`[ClientRegistry][${type}]`, { clientId, userId }),
);

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Server listening on ${opt.hostname}:${opt.port}`);
});

persistTicker.start();
updateTicker.start();
syncServer.start();
