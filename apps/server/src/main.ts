#!/usr/bin/env node

import "dotenv/config";
import path from "node:path";
import http from "node:http";
import { Logger } from "@mp/logger";
import express from "express";
import { type PathToLocalFile, type UrlToPublicFile } from "@mp/data";
import createCors from "cors";
import { createAuthClient } from "@mp/auth/server";
import * as trpcExpress from "@trpc/server/adapters/express";
import type { ClientId } from "@mp/sync/server";
import { SyncServer } from "@mp/sync/server";
import { Ticker, createDynamicDeltaFn } from "@mp/time";
import {
  collectDefaultMetrics,
  createMetricsScrapeMiddleware,
  MetricsHistogram,
  MetricsRegistry,
} from "@mp/metrics";
import type { WorldState } from "./modules/world/schema";
import type { HttpSessionId, SyncServerConnectionMetaData } from "./context";
import { type ServerContext } from "./context";
import { loadAreas } from "./modules/area/loadAreas";
import { readCliOptions, type CliOptions } from "./cli";
import { createDBClient } from "./db/client";
import { loadWorldState, persistWorldState } from "./modules/world/persistence";
import { ClientRegistry } from "./modules/world/ClientRegistry";
import { createRootRouter } from "./modules/router";
import { tokenHeaderName } from "./shared";
import { createClientEnvMiddleware } from "./clientEnv";
import { trpcEndpointPath } from "./shared";
import { collectUserMetrics } from "./modules/world/collectUserMetrics";

const opt = readCliOptions();
const logger = new Logger(console);
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
collectUserMetrics(metrics, clients);

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

const delta = createDynamicDeltaFn(() => performance.now());
const auth = createAuthClient({ secretKey: opt.authSecretKey });
const db = createDBClient(opt.databaseUrl);
const defaultAreaId = [...areas.value.keys()][0];
const initialWorldState = await loadWorldState(db);
if (initialWorldState.isErr()) {
  logger.error("Failed to load world state", initialWorldState.error);
  process.exit(1);
}

const expressLogger = createExpressLogger(logger.chain("http"));

const webServer = express()
  .use(expressLogger)
  .use(createClientEnvMiddleware(opt))
  .use(createMetricsScrapeMiddleware(metrics))
  .use(createCors({ origin: opt.corsOrigin }))
  .use(opt.publicPath, express.static(opt.publicDir));

const httpServer = http.createServer(webServer);

export const worldState = new SyncServer<
  WorldState,
  SyncServerConnectionMetaData
>({
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

const persistTicker = new Ticker({
  delta,
  middleware: persist,
  interval: opt.persistInterval,
});

const ticker = new Ticker({
  interval: opt.tickInterval,
  delta,
  middleware({ delta: tickInterval, next }) {
    try {
      tickIntervalMetric.observe(tickInterval.totalMilliseconds);
      const start = performance.now();
      next(tickInterval);
      const tickDuration = performance.now() - start;
      tickDurationMetric.observe(tickDuration);
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
  trpcEndpointPath,
  trpcExpress.createExpressMiddleware({
    router: apiRouter,
    createContext: ({ req }) =>
      createServerContext(
        `${req.ip}-${req.headers["user-agent"]}` as HttpSessionId,
        String(req.headers[tokenHeaderName]) as ServerContext["authToken"],
      ),
  }),
);

if (opt.clientDir !== undefined) {
  const indexFile = path.resolve(opt.clientDir, "index.html");
  webServer.use("/", express.static(opt.clientDir));
  webServer.get("*", (_, res) => res.sendFile(indexFile));
}

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
  const characterId = clients.getCharacterId(clientId);
  if (!characterId) {
    throw new Error(
      "Could not derive world state for client: client has no associated character",
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
  };
}

async function handleSyncServerConnection(
  clientId: ClientId,
  { token }: SyncServerConnectionMetaData,
) {
  logger.info("Client connected", clientId);
  try {
    const { userId } = await auth.verifyToken(token);
    clients.associateClientWithUser(clientId, userId);
    logger.info("Client verified and associated with user", {
      clientId,
      userId,
    });
  } catch {
    logger.info("Client connection rejected", clientId);
    worldState.disconnectClient(clientId);
  }
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

function serverTextHeader(options: CliOptions) {
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
buildVersion: ${options.buildVersion}
hostname: ${options.hostname}
port: ${options.port}
authSecretKey: ${options.authSecretKey ? "set" : "not set"}
databaseUrl: ${options.databaseUrl}
httpBaseUrl: ${options.httpBaseUrl}
wsBaseUrl: ${options.wsBaseUrl}
publicDir: ${options.publicDir}
clientDir: ${options.clientDir}
corsOrigin: ${options.corsOrigin}
Tick interval: ${options.tickInterval.totalMilliseconds}ms
Persist interval: ${options.persistInterval.totalMilliseconds}ms
=====================================================`;
}
