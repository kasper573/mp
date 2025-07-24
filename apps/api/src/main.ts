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
import type { ApiContext } from "./rpc";
import { createCdnResolver, ctxCdnResolver } from "./cdn";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting API...`);

const tokenResolver = createTokenResolver(opt.auth);

const cdnResolver = createCdnResolver(opt.cdnBaseUrl);

const requestLimiter = new RateLimiter({ points: 20, duration: 1 });

const ioc = new ImmutableInjectionContainer()
  .provide(ctxTokenResolver, tokenResolver)
  .provide(ctxCdnResolver, cdnResolver);

const app = express();
app.use(
  "/",
  trpcExpress.createExpressMiddleware({
    router: apiRouter,
    onError: (opt) => logger.error(opt.error, "RPC error"),
    createContext: ({ req, info }): ApiContext => {
      requestLimiter.consume(sessionId(req));
      logger.info(info, "[req]");
      return { ioc };
    },
  }),
);

app.listen(opt.port, opt.hostname, () => {
  logger.info(`API listening on ${opt.hostname}:${opt.port}`);
});

function sessionId(req: express.Request): string {
  // TODO use a proper session ID
  return String(req.socket.remoteAddress);
}
