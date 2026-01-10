import { createDbRepository } from "@mp/db";
import type { CharacterId } from "@mp/game-shared";
import {
  CharacterIdType,
  GameServiceConfig,
  gameServiceConfigRedisKey,
  onlineCharacterIdsRedisKey,
} from "@mp/game-shared";
import { InjectionContainer } from "@mp/ioc";
import { createPinoLogger } from "@mp/logger/pino";
import type { AccessToken } from "@mp/auth";
import { createTokenResolver } from "@mp/auth/server";
import {
  createRedisSetReadEffect,
  createRedisSyncEffect,
  Redis,
} from "@mp/redis";
import { signal } from "@mp/state";
import { collectDefaultMetrics, metricsMiddleware } from "@mp/telemetry/prom";
import "dotenv/config";
import express from "express";
import type { IncomingHttpHeaders } from "http";
import type { ApiContext } from "./context";
import {
  ctxAccessToken,
  ctxDb,
  ctxFileResolver,
  ctxGameServiceConfig,
  ctxLogger,
  ctxOnlineCharacterIds,
  ctxTokenResolver,
} from "./context";
import { createFileResolver } from "./integrations/file-resolver";
import { opt } from "./options";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { json } from "express";
import http from "http";
import { getSchema } from "./schema.generated";
import { scalars } from "../shared/scalars";
import { apolloRequestLoggerPlugin } from "./integrations/apollo-request-logger";

// Note that this file is an entrypoint and should not have any exports

collectDefaultMetrics();

const logger = createPinoLogger(opt.log);
logger.info(opt, `Starting API...`);

const tokenResolver = createTokenResolver(opt.auth);

const db = createDbRepository(opt.databaseConnectionString);
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
  logger.error,
);

const onlineCharacterIds = signal<ReadonlySet<CharacterId>>(new Set());

createRedisSetReadEffect(
  redisClient,
  onlineCharacterIdsRedisKey,
  CharacterIdType,
  onlineCharacterIds,
  logger.error,
);

const fileResolver = createFileResolver(
  opt.fileServerInternalUrl,
  opt.fileServerPublicUrl,
);

const ioc = new InjectionContainer()
  .provide(ctxTokenResolver, tokenResolver)
  .provide(ctxFileResolver, fileResolver)
  .provide(ctxDb, db)
  .provide(ctxGameServiceConfig, gameServiceConfig)
  .provide(ctxLogger, logger)
  .provide(ctxOnlineCharacterIds, onlineCharacterIds);

const app = express();
const httpServer = http.createServer(app);

const apolloServer = new ApolloServer({
  schema: getSchema({ scalars }),
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    apolloRequestLoggerPlugin(),
  ],
  allowBatchedHttpRequests: true,
  formatError(formattedError) {
    if (opt.exposeErrorDetails) {
      return formattedError;
    }

    // Omit the sensitive error details
    return { message: "Internal Server Error" };
  },
});

await apolloServer.start();

app
  .use("/health", (_, res) => res.send("OK"))
  .use(metricsMiddleware())
  .use(
    json(),
    expressMiddleware(apolloServer, {
      context({ req }) {
        return Promise.resolve<ApiContext>({
          ioc: ioc.provide(ctxAccessToken, getAccessToken(req.headers)),
        });
      },
    }),
  );

await new Promise<void>((resolve) =>
  httpServer.listen(opt.port, opt.hostname, resolve),
);

logger.info(`API listening on ${opt.hostname}:${opt.port}`);

function getAccessToken(headers: IncomingHttpHeaders): AccessToken | undefined {
  const prefix = "Bearer ";
  const headerValue = String(headers.authorization ?? "");
  if (headerValue.startsWith(prefix)) {
    return headerValue.substring(prefix.length) as AccessToken;
  }
}
