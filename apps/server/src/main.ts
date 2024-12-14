#!/usr/bin/env node

import path from "node:path";
import { Logger } from "@mp/logger";
import type { PathToLocalFile, UrlToPublicFile } from "@mp/data";

import { createAuthServer } from "@mp/auth-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { ClientId } from "@mp/sync-server";
import { SyncServer, WSServerAdapter } from "@mp/sync-server";
import { measureTimeSpan, Ticker } from "@mp/time";
import {
  collectDefaultMetrics,
  createMetricsScrapeMiddleware,
  MetricsGague,
  MetricsHistogram,
  MetricsRegistry,
} from "@mp/metrics";
import { parseEnv } from "@mp/env";
import type { WorldState } from "./modules/world/schema.ts";
import type { HttpSessionId, SyncServerConnectionMetaData } from "./context.ts";
import type { ServerContext } from "./context.ts";
import { loadAreas } from "./modules/area/loadAreas.ts";
import type { ServerOptions } from "./schemas/serverOptions.ts";
import { serverOptionsSchema } from "./schemas/serverOptions.ts";
import { createDBClient } from "./db/client.ts";
import {
  loadWorldState,
  persistWorldState,
} from "./modules/world/persistence.ts";
import { ClientRegistry } from "./modules/world/ClientRegistry.ts";
import { createRootRouter } from "./modules/router.ts";
import { tokenHeaderName } from "./shared.ts";
import { collectUserMetrics } from "./modules/world/collectUserMetrics.ts";
import { clientMiddlewares } from "./clientMiddleware.ts";
import { type Context, Hono } from "@hono/hono";
import { createMiddleware } from "@hono/hono/factory";
import { cors } from "@hono/hono/cors";
import { getConnInfo, serveStatic, upgradeWebSocket } from "@hono/hono/deno";
import { cache as createCacheMiddleware } from "@hono/hono/cache";

const logger = new Logger(console);

const optResult = parseEnv(
  serverOptionsSchema,
  Deno.env.toObject(),
  "MP_SERVER_",
);
if (optResult.isErr()) {
  logger.error("Server options invalid or missing:\n", optResult.error);
  Deno.exit(1);
}

const opt = optResult.value;
logger.info(serverTextHeader(opt));

const areas = await loadAreas(path.resolve(opt.publicDir, "areas"));

if (areas.isErr() || areas.value.size === 0) {
  logger.error(
    "Cannot start server without areas",
    areas.isErr() ? areas.error : "No areas found",
  );
  Deno.exit(1);
}

const clients = new ClientRegistry();
const metrics = new MetricsRegistry();
collectDefaultMetrics({ register: metrics });

const processStartTime = new Date();

new MetricsGague({
  name: "process_uptime_seconds",
  help: "Time since the process started in seconds",
  registers: [metrics],
  collect() {
    const uptimeMs = new Date().getTime() - processStartTime.getTime();
    this.set(uptimeMs / 1000);
  },
});

const tickBuckets = [
  0.01,
  0.05,
  0.1,
  0.2,
  0.5,
  1,
  2,
  5,
  7,
  10,
  12,
  16,
  24,
  36,
  48,
  65,
  100,
  200,
  400,
  600,
  800,
  1000,
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
  Deno.exit(1);
}

const honoLogger = createHonoLogger(logger.chain("http"));

// TODO fix the cache, it doesn't seem to apply
const cache = createCacheMiddleware({
  cacheName: "mp",
  cacheControl: `max-age=${opt.publicMaxAge * 1000}`,
  wait: true,
});

const webServer = new Hono();

if (opt.trustProxy) {
  console.warn("trustProxy middleware is not implemented");
}

const wssAdapter = new WSServerAdapter();

webServer
  .use(honoLogger)
  .get(
    "/ws",
    upgradeWebSocket(() => ({
      onOpen: (_, { raw }) => wssAdapter.addSocket(raw!),
      onClose: (_, { raw }) => wssAdapter.removeSocket(raw!),
    })),
  )
  .use(createMetricsScrapeMiddleware(metrics))
  .use(cors({ origin: opt.corsOrigin }))
  .use(opt.publicPath + "*", cache, serveStatic({}));

const worldState = new SyncServer<WorldState, SyncServerConnectionMetaData>(
  wssAdapter,
  {
    initialState: initialWorldState.value,
    filterState: deriveWorldStateForClient,
    patchCallback: opt.logSyncPatches
      ? (patches) => logger.chain("sync").info(patches)
      : undefined,
    onConnection: handleSyncServerConnection,
    onDisconnect(clientId) {
      logger.info("Client disconnected", clientId);
      clients.deleteClient(clientId);
    },
  },
);

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
  (ctx) =>
    fetchRequestHandler({
      endpoint: opt.apiEndpointPath,
      req: ctx.req.raw,
      router: apiRouter,
      createContext: () =>
        createServerContext(
          getSessionId(ctx),
          ctx.req.raw.headers.get(
            tokenHeaderName,
          ) as ServerContext["authToken"],
        ),
    }),
);

if (opt.clientDir !== undefined) {
  webServer.use(...clientMiddlewares(opt.clientDir, cache));
}

logger.info(`Server listening on ${opt.hostname}:${opt.port}`);

Deno.serve(opt, webServer.fetch);
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

function createHonoLogger(logger: Logger) {
  return createMiddleware(async ({ req }, next) => {
    logger.info(req.method, req.url);
    await next();
  });
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

function getSessionId(ctx: Context): HttpSessionId {
  const { address } = getConnInfo(ctx).remote;
  const userAgent = ctx.req.raw.headers.get("user-agent") as string;
  return `${address}-${userAgent}` as HttpSessionId;
}
