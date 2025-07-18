import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { createConsoleLogger } from "@mp/logger";
import express from "express";
import createCors from "cors";
import { createTokenResolver } from "@mp/auth/server";
import { MetricsRegistry } from "@mp/telemetry/prom";
import { WebSocketServer } from "@mp/ws/server";
import { ImmutableInjectionContainer } from "@mp/ioc";
import {
  ctxClientId,
  ctxClientRegistry,
  ctxTokenResolver,
  ctxUserService,
} from "@mp/game/server";
import { RateLimiter } from "@mp/rate-limiter";
import type { LocalFile } from "@mp/std";
import { ctxGlobalMiddleware } from "@mp/game/server";
import {
  ctxAreaFileUrlResolver,
  ctxAreaLookup,
  ClientRegistry,
} from "@mp/game/server";
import { parseBypassUser, type AccessToken, type UserIdentity } from "@mp/auth";
import { collectProcessMetrics } from "./metrics/process";
import { metricsMiddleware } from "./express/metrics-middleware";
import { createExpressLogger } from "./express/logger";
import { opt } from "./options";
import { rateLimiterMiddleware } from "./etc/rate-limiter-middleware";
import { serverFileToPublicUrl } from "./etc/server-file-to-public-url";
import { setupRpcTransceivers } from "./etc/rpc-wss";
import { loadAreas } from "./etc/load-areas";
import { getSocketId } from "./etc/get-socket-id";
import { loadActorModels } from "./etc/load-actor-models";
import { playerRoles } from "./roles";
import { createDbClient } from "./db/client";
import { createUserService } from "./db/services/user-service";
import { apiServerRpcRouter } from "./rpc/api-server-rpc";
import { AreaServerRegistry } from "./services/area-server-registry";

// Note that this file is an entrypoint and should not have any exports

const logger = createConsoleLogger();
logger.info(opt, `Starting API server...`);

RateLimiter.enabled = opt.rateLimit;

const userService = createUserService();
const clients = new ClientRegistry();
const metrics = new MetricsRegistry();
const tokenResolver = createTokenResolver({
  ...opt.auth,
  getBypassUser,
  onResolve(result) {
    if (result.isOk()) {
      userService.memorizeUserInfo(result.value);
    }
  },
});

const db = createDbClient(opt.databaseUrl);
db.$client.on("error", (err) => logger.error(err, "Database error"));

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
    }),
  );

const httpServer = http.createServer(webServer);

logger.info(`Loading areas and actor models...`);
const [areas, _actorModels] = await Promise.all([
  loadAreas(path.resolve(opt.publicDir, "areas")),
  loadActorModels(opt.publicDir),
]);

const _areaServerRegistry = new AreaServerRegistry(db);

const wss = new WebSocketServer({
  path: opt.wsEndpointPath,
  server: httpServer,
  maxPayload: 5000,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 6,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 10,
    threshold: 1024,
  },
});

wss.on("error", (err) => logger.error(err, "WebSocketServer error"));

wss.on("connection", (socket) => {
  socket.on("close", () => clients.removeClient(getSocketId(socket)));
  socket.on("error", (err) =>
    logger.error(err, `WebSocket error for client ${getSocketId(socket)}`),
  );
});

const ioc = new ImmutableInjectionContainer()
  .provide(ctxGlobalMiddleware, rateLimiterMiddleware)
  .provide(ctxUserService, userService)
  .provide(ctxAreaLookup, areas)
  .provide(ctxTokenResolver, tokenResolver)
  .provide(ctxClientRegistry, clients)
  .provide(ctxAreaFileUrlResolver, (id) =>
    serverFileToPublicUrl(`areas/${id}.json` as LocalFile),
  );

setupRpcTransceivers({
  wss,
  logger,
  router: apiServerRpcRouter,
  createContext: (socket) => ioc.provide(ctxClientId, getSocketId(socket)),
});

collectProcessMetrics(metrics);

logger.info(`Attempting to listen on ${opt.hostname}:${opt.port}...`);
httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`API server listening on ${opt.hostname}:${opt.port}`);
});

function getBypassUser(token: AccessToken): UserIdentity | undefined {
  if (!opt.auth.allowBypassUsers) {
    return;
  }

  const user = parseBypassUser(token);
  if (!user) {
    return;
  }

  user.roles = new Set(playerRoles);
  return user;
}
