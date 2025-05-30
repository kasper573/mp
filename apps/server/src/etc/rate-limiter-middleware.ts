import { ctxClientId, rpc } from "@mp/game/server";
import { RateLimiter } from "@mp/rate-limiter";

const globalRequestLimit = new RateLimiter({ points: 20, duration: 1 });

export const rateLimiterMiddleware = rpc.middleware(async ({ ctx }) => {
  const result = await globalRequestLimit.consume(ctx.get(ctxClientId));
  if (result.isErr()) {
    throw new Error("Rate limit exceeded");
  }
});
