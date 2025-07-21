import { ctxClientId, eventHandlerBuilder } from "@mp/game/server";
import { RateLimiter } from "@mp/rate-limiter";
import { rpc } from "./rpc-builder";

const globalRequestLimit = new RateLimiter({ points: 20, duration: 1 });

export const rateLimiterRpcMiddleware = rpc.middleware(async ({ ctx }) => {
  const result = await globalRequestLimit.consume(ctx.get(ctxClientId));
  if (result.isErr()) {
    throw new Error("Rate limit exceeded");
  }
});

export const rateLimiterEventMiddleware = eventHandlerBuilder.middleware(
  async ({ ctx }) => {
    const result = await globalRequestLimit.consume(ctx.get(ctxClientId));
    if (result.isErr()) {
      throw new Error("Rate limit exceeded");
    }
  },
);
