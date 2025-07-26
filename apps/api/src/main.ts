import "dotenv/config";
import { opt } from "./options";
import { ctxTokenResolver, registerEncoderExtensions } from "@mp/game/server";
import { createPinoLogger } from "@mp/logger/pino";
import * as trpcExpress from "@trpc/server/adapters/express";
import express from "express";
import { apiRouter } from "./router";
import { ImmutableInjectionContainer } from "@mp/ioc";
import { RateLimiter } from "@mp/rate-limiter";
import { createTokenResolver } from "@mp/auth/server";
import type { ApiContext } from "./integrations/trpc";
import {
  createFileResolver,
  ctxFileResolver,
} from "./integrations/file-server";
import { ctxToken as ctxAccessToken } from "./integrations/auth";
import type { AccessToken } from "@mp/auth";
import type { IncomingHttpHeaders } from "http";
import { createDbClient } from "@mp/db-client";
import { ctxDbClient } from "./context";
import { collectDefaultMetrics, metricsMiddleware } from "@mp/telemetry/prom";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

collectDefaultMetrics();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting API...`);

const tokenResolver = createTokenResolver(opt.auth);

const dbClient = createDbClient(opt.databaseConnectionString);

const fileResolver = createFileResolver(opt.fileServerBaseUrl);

const requestLimiter = new RateLimiter({ points: 20, duration: 1 });

const ioc = new ImmutableInjectionContainer()
  .provide(ctxTokenResolver, tokenResolver)
  .provide(ctxFileResolver, fileResolver)
  .provide(ctxDbClient, dbClient);

const app = express()
  .use(metricsMiddleware())
  .use(
    "/",
    trpcExpress.createExpressMiddleware({
      router: apiRouter,
      onError: (opt) => logger.error(opt.error, "RPC error"),
      createContext: ({ req, info }): ApiContext => {
        requestLimiter.consume(sessionId(req));
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

function sessionId(req: express.Request): string {
  return String(req.socket.remoteAddress);
}

function getAccessToken(headers: IncomingHttpHeaders): AccessToken | undefined {
  const prefix = "Bearer ";
  const headerValue = String(headers.authorization ?? "");
  if (headerValue.startsWith(prefix)) {
    return headerValue.substring(prefix.length) as AccessToken;
  }
}
