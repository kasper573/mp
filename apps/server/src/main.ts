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
import type { AuthToken } from "@mp/auth";
import { InjectionContainer } from "@mp/ioc";
import { ctx_authServer, ctx_request } from "@mp-modules/user";
import { RateLimiter } from "@mp/rate-limiter";
import {
  ctx_globalMiddleware,
  ctx_trpcErrorFormatter,
  trpcExpress,
} from "@mp-modules/trpc/server";
import { createDBClient } from "@mp-modules/db";
import type { GameState, GameStateServer } from "@mp-modules/game/server";
import {
  ctx_areaFileUrlResolver,
  ctx_areaLookup,
  loadAreas,
  ClientRegistry,
  movementBehavior,
  npcSpawnBehavior,
  combatBehavior,
  characterRemoveBehavior,
  CharacterService,
  ctx_characterService,
  npcAIBehavior,
  ctx_npcService,
  ctx_gameStateMachine,
  deriveClientVisibility,
  NPCService,
  GameService,
} from "@mp-modules/game/server";
import type { LocalFile } from "@mp/std";
import { collectProcessMetrics } from "./metrics/collectProcessMetrics";
import { metricsMiddleware } from "./express/metricsMiddleware";
import { collectUserMetrics } from "./metrics/collectUserMetrics";
import { createTickMetricsObserver } from "./metrics/observeTickMetrics";
import { createExpressLogger } from "./express/createExpressLogger";
import { collectPathFindingMetrics } from "./metrics/collectPathFindingMetrics";
import { opt } from "./options";
import { errorFormatter } from "./etc/errorFormatter";
import { rateLimiterMiddleware } from "./etc/rateLimiterMiddleware";
import { serverFileToPublicUrl } from "./etc/serverFileToPublicUrl";
import { rootRouter } from "./router";
import { clientViewDistance } from "./shared";

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
  .use("/health", (_, res) => res.send("OK"))
  // the above is intentionally placed before logger since it's so verbose and unnecessary to log
  .use(createExpressLogger(logger))
  .use(createCors({ origin: opt.corsOrigin }))
  .use(
    opt.publicPath,
    express.static(opt.publicDir, { maxAge: opt.publicMaxAge * 1000 }),
  );

const httpServer = http.createServer(webServer);

const syncHandshakeLimiter = new RateLimiter({
  points: 10,
  duration: 30,
});

const areas = await loadAreas(path.resolve(opt.publicDir, "areas"));

const gameState = createPatchStateMachine<GameState>({
  initialState: { actors: {} },
  clientIds: () => syncServer.clientIds,
  clientVisibility: deriveClientVisibility(
    clients,
    clientViewDistance.networkFogOfWarTileCount,
    areas,
  ),
});

const syncServer: GameStateServer = new SyncServer({
  logger,
  httpServer,
  encoder: opt.syncPatchEncoder,
  path: opt.wsEndpointPath,
  state: gameState,
  async handshake(_, { token }) {
    const result = await auth.verifyToken(token as AuthToken);
    return result.asyncAndThrough((user) =>
      syncHandshakeLimiter.consume(user.id),
    );
  },
  onConnection: (clientId, user) => clients.add(clientId, user.id),
  onDisconnect: (clientId) => clients.remove(clientId),
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
  .provide(ctx_authServer, auth)
  .provide(ctx_globalMiddleware, rateLimiterMiddleware)
  .provide(ctx_trpcErrorFormatter, errorFormatter)
  .provide(ctx_npcService, npcService)
  .provide(ctx_characterService, characterService)
  .provide(ctx_gameStateMachine, gameState)
  .provide(ctx_areaLookup, areas)
  .provide(ctx_areaFileUrlResolver, (id) =>
    serverFileToPublicUrl(`areas/${id}.tmj` as LocalFile),
  );

webServer.use(
  opt.apiEndpointPath,
  trpcExpress.createExpressMiddleware({
    onError: ({ path, error }) => logger.error(error),
    router: rootRouter,
    createContext: ({ req }: { req: express.Request }) => ({
      ioc: ioc.provide(ctx_request, req),
    }),
  }),
);

collectDefaultMetrics({ register: metrics });
collectProcessMetrics(metrics);
collectUserMetrics(metrics, clients, gameState, syncServer);
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
