import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { consoleLoggerHandler, Logger } from "@mp/logger";
import express from "express";
import createCors from "cors";
import type { AuthToken } from "@mp/auth";
import { createAuthServer } from "@mp/auth/server";
import * as trpcExpress from "@trpc/server/adapters/express";
import { SyncServer, SyncStateMachine } from "@mp/sync/server";
import { Ticker } from "@mp/time";
import { collectDefaultMetrics, MetricsRegistry } from "@mp/telemetry/prom";
import { createServerContextFactory } from "./context";
import { createDBClient } from "./db/client";
import { ClientRegistry } from "./ClientRegistry";
import { createRootRouter } from "./modules/router";
import { collectProcessMetrics } from "./metrics/collectProcessMetrics";
import { metricsMiddleware } from "./express/metricsMiddleware";
import { CharacterService } from "./modules/character/service";
import type { WorldState, WorldSyncServer } from "./modules/world/WorldState";
import { movementBehavior } from "./traits/movement";
import { characterRemoveBehavior } from "./modules/character/characterRemoveBehavior";
import { collectUserMetrics } from "./metrics/collectUserMetrics";
import { createTickMetricsObserver } from "./metrics/observeTickMetrics";
import { createExpressLogger } from "./express/createExpressLogger";
import { createUrlResolver } from "./createUrlResolver";
import { loadAreas } from "./modules/area/loadAreas";
import { collectPathFindingMetrics } from "./metrics/collectPathFindingMetrics";
import { npcAIBehavior } from "./modules/npc/npcAIBehavior";
import { WorldService } from "./modules/world/service";
import { npcSpawnBehavior } from "./modules/npc/npcSpawnBehavior";
import { NPCService } from "./modules/npc/service";
import { createRateLimiter } from "./createRateLimiter";
import { opt } from "./options";
import { deriveWorldStateForClient } from "./modules/world/deriveWorldStateForClient";

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));
logger.info(`Server started with options`, opt);

const clients = new ClientRegistry();
const metrics = new MetricsRegistry();
const auth = createAuthServer(opt.auth);
const db = createDBClient(opt.databaseUrl, logger);

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

const syncHandshakeLimiter = createRateLimiter({
  points: 10,
  duration: 30,
});

const worldStateMachine = new SyncStateMachine<WorldState>({
  clientIds: () => syncServer.clientIds,
  state: () => ({ actors: {} }),
  clientVisibility: deriveWorldStateForClient(clients),
});

const syncServer: WorldSyncServer = new SyncServer({
  logger,
  httpServer,
  path: opt.wsEndpointPath,
  state: worldStateMachine,
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
  middleware: () => {
    const state = syncServer.access((state) => state);
    return worldService.persist(state);
  },
});

const updateTicker = new Ticker({
  onError: logger.error,
  interval: opt.tickInterval,
  middleware: createTickMetricsObserver(metrics),
});

const areas = await loadAreas(path.resolve(opt.publicDir, "areas"));
const characterService = new CharacterService(db, areas);

const trpcRouter = createRootRouter({
  areas,
  npcService,
  characterService,
  state: syncServer.access,
  createUrl: createUrlResolver(opt),
  buildVersion: opt.buildVersion,
  updateTicker,
});

webServer.use(
  opt.apiEndpointPath,
  trpcExpress.createExpressMiddleware({
    onError: ({ path, error }) =>
      logger.error(`[trpc error][${path}]: ${error.message}`),
    router: trpcRouter,
    createContext: createServerContextFactory(
      auth,
      syncServer,
      clients,
      logger,
      opt.exposeErrorDetails,
    ),
  }),
);

collectDefaultMetrics({ register: metrics });
collectProcessMetrics(metrics);
collectUserMetrics(metrics, clients, syncServer);
collectPathFindingMetrics(metrics);

updateTicker.subscribe(npcAIBehavior(syncServer.access, areas));
updateTicker.subscribe(movementBehavior(syncServer.access, areas));
updateTicker.subscribe(npcSpawnBehavior(syncServer.access, npcService, areas));
updateTicker.subscribe(updateTicker.encapsulateAsyncHandler(syncServer.flush));
characterRemoveBehavior(clients, syncServer.access, logger, 5000);

clients.on(({ type, clientId, userId }) =>
  logger.info(`[ClientRegistry][${type}]`, { clientId, userId }),
);

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Server listening on ${opt.hostname}:${opt.port}`);
});

persistTicker.start();
updateTicker.start();
syncServer.start();
