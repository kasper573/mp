#!/usr/bin/env node

import "dotenv/config";
import path from "node:path";
import http from "node:http";
import { Logger } from "@mp/logger";
import express from "express";
import { type PathToLocalFile, type UrlToPublicFile } from "@mp/data";
import createCors from "cors";
import { createAuthServer } from "@mp/auth-server";
import * as trpcExpress from "@trpc/server/adapters/express";
import type { ClientId } from "@mp/sync-server";
import { SyncServer } from "@mp/sync-server";
import { measureTimeSpan, Ticker, TimeSpan } from "@mp/time";
import {
  collectDefaultMetrics,
  MetricsGague,
  MetricsHistogram,
  MetricsRegistry,
} from "@mp/metrics";
import { parseEnv } from "@mp/env";
import type { WorldState } from "./modules/world/schema";
import type { HttpSessionId, SyncServerConnectionMetaData } from "./context";
import { type ServerContext } from "./context";
import { loadAreas } from "./modules/area/loadAreas";
import type { ServerOptions } from "./schemas/serverOptions";
import { serverOptionsSchema } from "./schemas/serverOptions";
import { createDBClient } from "./db/client";
import { loadWorldState, persistWorldState } from "./modules/world/persistence";
import { ClientRegistry } from "./modules/world/ClientRegistry";
import { createRootRouter } from "./modules/router";
import { tokenHeaderName } from "./shared";
import { collectUserMetrics } from "./modules/world/collectUserMetrics";
import { metricsMiddleware } from "./express/metricsMiddleware";

const logger = new Logger(console);

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
collectDefaultMetrics({ register: metrics });

new MetricsGague({
  name: "process_uptime_seconds",
  help: "Time since the process started in seconds",
  registers: [metrics],
  collect() {
    this.set(process.uptime());
  },
});

const tickBuckets = [
  0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 7, 10, 12, 16, 24, 36, 48, 65, 100, 200,
  400, 600, 800, 1000,
];

const tickIntervalMetric = new MetricsHistogram({
  name: "server_tick_interval",
  help: "Time between each server tick in milliseconds",
  registers: [metrics],
  buckets: tickBuckets,
});

const tickDurationMetric = new MetricsHistogram({
  name: "server_tick_duration",
  help: "Time taken to process each server tick in milliseconds",
  registers: [metrics],
  buckets: tickBuckets,
});

const auth = createAuthServer(opt.auth);
const db = createDBClient(opt.databaseUrl);
const defaultAreaId = [...areas.value.keys()][0];
const initialWorldState = await loadWorldState(db);
if (initialWorldState.isErr()) {
  logger.error("Failed to load world state", initialWorldState.error);
  process.exit(1);
}

const expressLogger = createExpressLogger(logger.chain("http"));

const expressStaticConfig = {
  maxAge: opt.publicMaxAge * 1000,
};

const webServer = express()
  .set("trust proxy", opt.trustProxy)
  .use(expressLogger)
  .use(metricsMiddleware(metrics))
  .use(createCors({ origin: opt.corsOrigin }))
  .use(opt.publicPath, express.static(opt.publicDir, expressStaticConfig));

const httpServer = http.createServer(webServer);

const worldState = new SyncServer<WorldState, SyncServerConnectionMetaData>({
  initialState: initialWorldState.value,
  filterState: deriveWorldStateForClient,
  httpServer,
  patchCallback: opt.logSyncPatches
    ? (patches) => logger.chain("sync").info(patches)
    : undefined,
  onConnection: handleSyncServerConnection,
  onDisconnect(clientId) {
    logger.info("Client disconnected", clientId);
    clients.deleteClient(clientId);
  },
});

collectUserMetrics(metrics, clients, worldState);

const persistTicker = new Ticker({
  middleware: persist,
  interval: opt.persistInterval,
});

const ticker = new Ticker({
  interval: opt.tickInterval,
  middleware({ delta: tickInterval, next }) {
    try {
      tickIntervalMetric.observe(tickInterval.totalMilliseconds);
      const getMeasurement = measureTimeSpan();
      next(tickInterval);
      tickDurationMetric.observe(getMeasurement().totalMilliseconds);
    } catch (error) {
      logger.error("Error in server tick", error);
    }
  },
});

const apiRouter = createRootRouter({
  areas: areas.value,
  defaultAreaId,
  state: worldState.access,
  createUrl: urlToPublicFile,
  buildVersion: opt.buildVersion,
  ticker,
});

webServer.use(
  opt.apiEndpointPath,
  trpcExpress.createExpressMiddleware({
    router: apiRouter,
    createContext: ({ req }) =>
      createServerContext(
        `${req.ip}-${req.headers["user-agent"]}` as HttpSessionId,
        String(req.headers[tokenHeaderName]) as ServerContext["authToken"],
      ),
  }),
);

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Server listening on ${opt.hostname}:${opt.port}`);
});

persistTicker.start();
ticker.start();

async function persist() {
  const state = worldState.access("persist", (state) => state);
  const result = await persistWorldState(db, state);
  if (result.isErr()) {
    logger.error("Failed to persist world state", result.error);
  }
}

function deriveWorldStateForClient(state: WorldState, clientId: ClientId) {
  const userId = clients.getUserId(clientId);
  const char = Object.values(state.characters).find(
    (char) => char.userId === userId,
  );
  if (!char) {
    throw new Error(
      "Could not derive world state for client: user has no associated character",
    );
  }

  return state;
}

function createServerContext(
  sessionId: HttpSessionId,
  authToken: ServerContext["authToken"],
): ServerContext {
  return {
    sessionId,
    accessWorldState: worldState.access,
    authToken,
    auth,
    logger,
    clients,
    exposeErrorDetails: opt.exposeErrorDetails,
  };
}

async function handleSyncServerConnection(
  clientId: ClientId,
  { token }: SyncServerConnectionMetaData,
) {
  logger.info("Client connected", clientId);

  const verifyResult = await auth.verifyToken(token);
  if (!verifyResult.ok) {
    logger.info(
      "Could not verify client authentication token",
      clientId,
      verifyResult.error,
    );
    worldState.disconnectClient(clientId);
    return;
  }

  clients.associateClientWithUser(clientId, verifyResult.user.id);
  logger.info("Client verified and associated with user", {
    clientId,
    userId: verifyResult.user.id,
  });
}

function urlToPublicFile(fileInPublicDir: PathToLocalFile): UrlToPublicFile {
  const relativePath = path.isAbsolute(fileInPublicDir)
    ? path.relative(opt.publicDir, fileInPublicDir)
    : fileInPublicDir;
  return `${opt.httpBaseUrl}${opt.publicPath}${relativePath}` as UrlToPublicFile;
}

function createExpressLogger(logger: Logger): express.RequestHandler {
  return (req, _, next) => {
    logger.info(req.method, req.url);
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
${Object.entries(options)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => `${key}: ${optionValueToString(value)}`)
  .join("\n")}
=====================================================`;
}

function optionValueToString(value: unknown) {
  if (value instanceof TimeSpan) {
    return `${value.totalMilliseconds}ms`;
  }
  return String(value);
}
