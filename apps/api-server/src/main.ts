import "dotenv/config";
import http from "node:http";
import express from "express";
import createCors from "cors";
import { createTokenResolver } from "@mp/auth/server";
import { MetricsRegistry } from "@mp/telemetry/prom";
import { WebSocketServer } from "@mp/ws/server";
import { ImmutableInjectionContainer } from "@mp/ioc";
import { RateLimiter } from "@mp/rate-limiter";
import { parseBypassUser, type AccessToken, type UserIdentity } from "@mp/auth";
import { createExpressLogger } from "@mp/server-common";
import { metricsMiddleware } from "@mp/server-common";
import { collectProcessMetrics } from "@mp/server-common";
import { baseServerOptions } from "@mp/server-common";
import { playerRoles } from "@mp/server-common";
import { createDbClient } from "@mp/server-common";
import { createUserService } from "@mp/server-common";
import { ctxTokenResolver, ctxUserService } from "@mp/game/server";
import { createPinoLogger } from "@mp/logger/pino";
import { collectDefaultMetrics } from "@mp/telemetry/prom";
import { setupRpcTransceivers } from "./rpc-setup";
import { apiServerRpcRouter } from "./rpc";

// Note that this file is an entrypoint and should not have any exports

const opt = baseServerOptions;
const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting API server...`);

RateLimiter.enabled = opt.rateLimit;

const userService = createUserService();
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
  .use(createExpressLogger(logger))
  .use(createCors({ origin: opt.corsOrigin }))
  .use(
    opt.publicPath,
    express.static(opt.publicDir, {
      maxAge: opt.publicMaxAge * 1000,
    }),
  );

const httpServer = http.createServer(webServer);

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

const ioc = new ImmutableInjectionContainer()
  .provide(ctxTokenResolver, tokenResolver)
  .provide(ctxUserService, userService);

setupRpcTransceivers({
  wss,
  logger,
  router: apiServerRpcRouter,
  createContext: (_socket) => ioc,
});

collectDefaultMetrics({ register: metrics });
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
