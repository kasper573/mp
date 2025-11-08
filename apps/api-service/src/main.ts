import { createRepository } from "@mp/db";
import { GameServiceConfig, gameServiceConfigRedisKey } from "@mp/game-shared";
import { InjectionContainer } from "@mp/ioc";
import { createPinoLogger } from "@mp/logger/pino";
import type { AccessToken } from "@mp/oauth";
import { createTokenResolver } from "@mp/oauth/server";
import { createRedisSyncEffect, Redis } from "@mp/redis";
import { signal } from "@mp/state";
import { collectDefaultMetrics, metricsMiddleware } from "@mp/telemetry/prom";
import * as trpcExpress from "@trpc/server/adapters/express";
import "dotenv/config";
import express from "express";
import type { IncomingHttpHeaders } from "http";
import {
  ctxAccessToken,
  ctxDb,
  ctxFileResolver,
  ctxGameServiceConfig,
  ctxTokenResolver,
} from "./context";
import { createFileResolver } from "./integrations/file-resolver";
import type { ApiContext } from "./integrations/trpc";
import { opt } from "./options";
import { apiRouter } from "./router";

// Note that this file is an entrypoint and should not have any exports

collectDefaultMetrics();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting API...`);

const tokenResolver = createTokenResolver(opt.auth);

const db = createRepository(opt.databaseConnectionString);
db.subscribeToErrors((err) => logger.error(err, "Database error"));

const redisClient = new Redis(opt.redisPath);

const gameServiceConfig = signal<GameServiceConfig>({
  isPatchOptimizerEnabled: true,
});

createRedisSyncEffect(
  redisClient,
  gameServiceConfigRedisKey,
  GameServiceConfig,
  gameServiceConfig,
);

const fileResolver = createFileResolver(
  opt.fileServerInternalUrl,
  opt.fileServerPublicUrl,
);

const ioc = new InjectionContainer()
  .provide(ctxTokenResolver, tokenResolver)
  .provide(ctxFileResolver, fileResolver)
  .provide(ctxDb, db)
  .provide(ctxGameServiceConfig, gameServiceConfig);

const app = express()
  .use("/health", (_, res) => res.send("OK"))
  .use(metricsMiddleware())
  .use(
    "/",
    trpcExpress.createExpressMiddleware({
      router: apiRouter,
      onError: (opt) => logger.error(opt.error, "RPC error"),
      createContext: ({ req, info }): ApiContext => {
        logger.info(info, "[req]");
        return {
          ioc: ioc.provide(ctxAccessToken, getAccessToken(req.headers)),
        };
      },
    }),
  );

app.listen(opt.port, opt.hostname, () => {
  logger.info(`API listening on ${opt.hostname}:${opt.port}`);
});

function getAccessToken(headers: IncomingHttpHeaders): AccessToken | undefined {
  const prefix = "Bearer ";
  const headerValue = String(headers.authorization ?? "");
  if (headerValue.startsWith(prefix)) {
    return headerValue.substring(prefix.length) as AccessToken;
  }
}
