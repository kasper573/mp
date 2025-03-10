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
} from "@mp-modules/trpc";
import type { LocalFile } from "@mp/data";
import {
  ctx_areaFileUrlResolver,
  ctx_areaLookup,
  loadAreas,
} from "@mp-modules/area";
import { createDBClient } from "@mp-modules/db";
import type { WorldState, WorldSyncServer } from "@mp-modules/world";
import {
  ClientRegistry,
  movementBehavior,
  npcSpawnBehavior,
  combatBehavior,
  characterRemoveBehavior,
  CharacterService,
  ctx_characterService,
  npcAIBehavior,
  ctx_npcService,
  ctx_worldStateMachine,
  deriveClientVisibility,
  NPCService,
  WorldService,
} from "@mp-modules/world";
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

const worldState = createPatchStateMachine<WorldState>({
  initialState: { actors: {} },
  clientIds: () => syncServer.clientIds,
  clientVisibility: deriveClientVisibility(
    clients,
    clientViewDistance.networkFogOfWarTileCount,
  ),
});

const syncServer: WorldSyncServer = new SyncServer({
  logger,
  httpServer,
  encoder: opt.syncPatchEncoder,
  path: opt.wsEndpointPath,
  state: worldState,
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
const worldService = new WorldService(db);

const persistTicker = new Ticker({
  onError: logger.error,
  interval: opt.persistInterval,
  middleware: () => worldService.persist(worldState),
});

const updateTicker = new Ticker({
  onError: logger.error,
  interval: opt.tickInterval,
  middleware: createTickMetricsObserver(metrics),
});

const areas = await loadAreas(path.resolve(opt.publicDir, "areas"));
const characterService = new CharacterService(db, areas);

const ioc = new InjectionContainer()
  .provide(ctx_authServer, auth)
  .provide(ctx_globalMiddleware, rateLimiterMiddleware)
  .provide(ctx_trpcErrorFormatter, errorFormatter)
  .provide(ctx_npcService, npcService)
  .provide(ctx_characterService, characterService)
  .provide(ctx_worldStateMachine, worldState)
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
collectUserMetrics(metrics, clients, worldState, syncServer);
collectPathFindingMetrics(metrics);

updateTicker.subscribe(npcAIBehavior(worldState, areas));
updateTicker.subscribe(movementBehavior(worldState, areas));
updateTicker.subscribe(npcSpawnBehavior(worldState, npcService, areas));
updateTicker.subscribe(combatBehavior(worldState));
updateTicker.subscribe(syncServer.flush);
characterRemoveBehavior(clients, worldState, logger, 5000);

clients.on(({ type, clientId, userId }) =>
  logger.info(`[ClientRegistry][${type}]`, { clientId, userId }),
);

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Server listening on ${opt.hostname}:${opt.port}`);
});

persistTicker.start();
updateTicker.start();
syncServer.start();
