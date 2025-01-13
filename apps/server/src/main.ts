#!/usr/bin/env node

import "dotenv/config";
import path from "node:path";
import http from "node:http";
import { consoleLoggerHandler, Logger } from "@mp/logger";
import express from "express";
import { type PathToLocalFile, type UrlToPublicFile } from "@mp/data";
import createCors from "cors";
import type { AuthToken } from "@mp/auth-server";
import { createAuthServer } from "@mp/auth-server";
import * as trpcExpress from "@trpc/server/adapters/express";
import { SyncServer } from "@mp/sync/server";
import { Ticker } from "@mp/time";
import { collectDefaultMetrics, MetricsRegistry } from "@mp/telemetry/prom";
import { parseEnv } from "@mp/env";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { err } from "@mp/std";
import type { HttpSessionId } from "./context";
import { type ServerContext } from "./context";
import { loadAreas } from "./modules/area/loadAreas";
import type { ServerOptions } from "./options";
import { serverOptionsSchema } from "./options";
import { createDBClient } from "./db/client";
import { ClientRegistry } from "./ClientRegistry";
import { createRootRouter } from "./modules/router";
import { tokenHeaderName } from "./shared";
import { collectProcessMetrics } from "./metrics/collectUserMetrics";
import { metricsMiddleware } from "./express/metricsMiddleware";
import { deriveWorldStateForClient } from "./modules/world/deriveWorldStateForClient";
import { CharacterService } from "./modules/character/service";
import type { WorldState, WorldServer } from "./modules/world/WorldState";
import { characterMoveBehavior } from "./modules/character/characterMoveBehavior";
import { characterRemoveBehavior } from "./modules/character/characterRemoveBehavior";
import { collectUserMetrics } from "./metrics/collectProcessMetrics";
import { createTickMetricsObserver } from "./metrics/observeTickMetrics";

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

const optResult = parseEnv(serverOptionsSchema, process.env, "MP_SERVER_");
if (optResult.isErr()) {
  logger.error("Server options invalid or missing:\n", optResult.error);
  process.exit(1);
}

const opt = optResult.value;
logger.info(serverTextHeader(opt));

const areas = await loadAreas(path.resolve(opt.publicDir, "areas"));

if (areas.isErr() || areas.value.size === 0) {
  logger.error(
    "Cannot start server without areas",
    areas.isErr() ? areas.error : "No areas found",
  );
  process.exit(1);
}

const clients = new ClientRegistry();
const metrics = new MetricsRegistry();

const auth = createAuthServer(opt.auth);
const db = createDBClient(opt.databaseUrl, logger);
const defaultAreaId = [...areas.value.keys()][0];

const expressLogger = createExpressLogger(logger);

const expressStaticConfig = {
  maxAge: opt.publicMaxAge * 1000,
};

const webServer = express()
  .set("trust proxy", opt.trustProxy)
  .use(metricsMiddleware(metrics)) // Intentionally placed before logger since it's so verbose and unnecessary to log
  .use(expressLogger)
  .use(createCors({ origin: opt.corsOrigin }))
  .use(opt.publicPath, express.static(opt.publicDir, expressStaticConfig));

const httpServer = http.createServer(webServer);

const syncHandshakeLimiter = new RateLimiterMemory({
  points: 10,
  duration: 30,
});

const syncServer: WorldServer = new SyncServer({
  logger,
  httpServer,
  path: opt.wsEndpointPath,
  initialState: { characters: {} } as WorldState,
  logSyncPatches: opt.logSyncPatches,
  async handshake(_, { token }) {
    const result = await auth.verifyToken(token as AuthToken);
    if (result.isOk()) {
      try {
        await syncHandshakeLimiter.consume(result.value.id);
      } catch {
        return err("Rate limit exceeded");
      }
    }
    return result;
  },
  createClientState: deriveWorldStateForClient(clients),
  onConnection: (clientId, user) => clients.add(clientId, user.id),
  onDisconnect: (clientId) => clients.remove(clientId),
});

clients.on(({ type, clientId, userId }) =>
  logger.info(`[ClientRegistry][${type}]`, { clientId, userId }),
);

collectDefaultMetrics({ register: metrics });
collectProcessMetrics(metrics);
collectUserMetrics(metrics, clients, syncServer);
const observeTickMetrics = createTickMetricsObserver(metrics);

const persistTicker = new Ticker({
  onError: logger.error,
  interval: opt.persistInterval,
  middleware: () =>
    worldService.persistWorldState(
      syncServer.access("persist", (state) => state),
    ),
});

const physicsTicker = new Ticker({
  onError: logger.error,
  interval: opt.tickInterval,
  middleware: observeTickMetrics,
});

const worldService = new CharacterService(db, areas.value, defaultAreaId);

const trpcRouter = createRootRouter({
  areas: areas.value,
  service: worldService,
  state: syncServer.access,
  createUrl: urlToPublicFile,
  buildVersion: opt.buildVersion,
});

webServer.use(
  opt.apiEndpointPath,
  trpcExpress.createExpressMiddleware({
    onError: ({ path, error }) =>
      logger.error(`[trpc error][${path}]: ${error.message}`),
    router: trpcRouter,
    createContext: ({ req }) =>
      createServerContext(
        `${req.ip}-${req.headers["user-agent"]}` as HttpSessionId,
        String(req.headers[tokenHeaderName]) as ServerContext["authToken"],
      ),
  }),
);

physicsTicker.subscribe(characterMoveBehavior(syncServer.access, areas.value));
characterRemoveBehavior(clients, syncServer.access, logger, 5000);

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Server listening on ${opt.hostname}:${opt.port}`);
});

persistTicker.start();
physicsTicker.start();
syncServer.start();

function createServerContext(
  sessionId: HttpSessionId,
  authToken: ServerContext["authToken"],
): ServerContext {
  return {
    sessionId,
    accessWorldState: syncServer.access,
    authToken,
    auth,
    logger,
    clients,
    exposeErrorDetails: opt.exposeErrorDetails,
  };
}

function urlToPublicFile(fileInPublicDir: PathToLocalFile): UrlToPublicFile {
  const relativePath = path.isAbsolute(fileInPublicDir)
    ? path.relative(opt.publicDir, fileInPublicDir)
    : fileInPublicDir;
  return `${opt.httpBaseUrl}${opt.publicPath}${relativePath}` as UrlToPublicFile;
}

function createExpressLogger(logger: Logger): express.RequestHandler {
  return (req, _, next) => {
    logger.info("[http]", req.method, req.url);
    next();
  };
}

function serverTextHeader(options: ServerOptions) {
  return `
===============================
#                             #
#     ███╗   ███╗ ██████╗     #
#     ████╗ ████║ ██╔══██╗    #
#     ██╔████╔██║ ██████╔╝    #
#     ██║╚██╔╝██║ ██╔═══╝     #
#     ██║ ╚═╝ ██║ ██║         #
#     ╚═╝     ╚═╝ ╚═╝         #
===============================
${JSON.stringify(options, null, 2)}
=====================================================`;
}
