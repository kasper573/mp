import "dotenv/config";
import { opt } from "./options";
import { ctxTokenResolver } from "@mp/game/server";
import { createPinoLogger } from "@mp/logger/pino";
import * as trpcExpress from "@trpc/server/adapters/express";
import express from "express";
import { apiRouter } from "./router";
import { ImmutableInjectionContainer } from "@mp/ioc";
import { createTokenResolver } from "@mp/auth/server";
import type { ApiContext } from "./integrations/trpc";
import { createFileResolver } from "./integrations/file-resolver";
import type { AccessToken } from "@mp/auth";
import type { IncomingHttpHeaders } from "http";
import { createDbClient } from "@mp/db-client";
import { ctxAccessToken, ctxDbClient, ctxFileResolver } from "./ioc";
import { collectDefaultMetrics, metricsMiddleware } from "@mp/telemetry/prom";

// Note that this file is an entrypoint and should not have any exports

collectDefaultMetrics();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting API...`);

const tokenResolver = createTokenResolver(opt.auth);

const db = createDbClient(opt.databaseConnectionString);
db.$client.on("error", (err) => logger.error(err, "Database error"));

const fileResolver = createFileResolver(opt.fileServerBaseUrl);

const ioc = new ImmutableInjectionContainer()
  .provide(ctxTokenResolver, tokenResolver)
  .provide(ctxFileResolver, fileResolver)
  .provide(ctxDbClient, db);

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
