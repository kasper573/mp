import { createDbRepository } from "@mp/db";
import type { CharacterId } from "@mp/game-shared";
import {
  GameServiceConfig,
  gameServiceConfigRedisKey,
  onlineCharacterIdsRedisKey,
} from "@mp/game-shared";
import { InjectionContainer } from "@mp/ioc";
import { createPinoLogger } from "@mp/logger/pino";
import type { AccessToken } from "@mp/auth";
import { createTokenResolver } from "@mp/auth/server";
import { Redis, RedisSetSync, RedisSync } from "@mp/redis";
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
import { setupGracefulShutdown } from "@mp/std";
import { createGraphQLWSServer } from "./integrations/graphql-ws";

// Note that this file is an entrypoint and should not have any exports

collectDefaultMetrics();

const shutdownCleanups: Array<() => unknown> = [];
setupGracefulShutdown(process, shutdownCleanups);

const logger = createPinoLogger(opt.log);
logger.info(opt, `Starting API...`);

const tokenResolver = createTokenResolver(opt.auth);

const db = createDbRepository(opt.databaseConnectionString);
db.subscribeToErrors((err) => logger.error(err, "Database error"));
shutdownCleanups.push(() => db.dispose());

const redisClient = new Redis(opt.redisPath);

const gameServiceConfig = signal<GameServiceConfig>({
  isPatchOptimizerEnabled: true,
});

const onlineCharacterIds = signal<ReadonlySet<CharacterId>>(new Set());

shutdownCleanups.push(
  RedisSync.createEffect(
    {
      redis: redisClient,
      key: gameServiceConfigRedisKey,
      schema: GameServiceConfig,
      signal: gameServiceConfig,
      onError: logger.error,
    },
    (b) => b.load().synchronize(),
  ),
  RedisSetSync.createEffect(
    {
      redis: redisClient,
      key: onlineCharacterIdsRedisKey,
      signal: onlineCharacterIds,
      onError: logger.error,
    },
    (b) => b.load().subscribe(),
  ),
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
shutdownCleanups.push(() => httpServer.close());

const graphqlSchema = getSchema({ scalars });
const apolloServer = new ApolloServer({
  schema: graphqlSchema,
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
shutdownCleanups.push(() => apolloServer.stop());

const graphqlWss = createGraphQLWSServer({
  httpServer,
  schema: graphqlSchema,
  logger,
  context: (req) => contextForRequest(req.headers),
});
shutdownCleanups.push(() => graphqlWss.close());

// Apollo server must be started before using the expressMiddleware
await apolloServer.start();

app
  .use("/health", (_, res) => res.send("OK"))
  .use(metricsMiddleware())
  .use(
    json(),
    expressMiddleware(apolloServer, {
      context: ({ req }) => Promise.resolve(contextForRequest(req.headers)),
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

function contextForRequest(headers: IncomingHttpHeaders): ApiContext {
  return {
    ioc: ioc.provide(ctxAccessToken, getAccessToken(headers)),
  };
}
