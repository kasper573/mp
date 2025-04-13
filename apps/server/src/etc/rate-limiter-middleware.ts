import { RPCError } from "@mp/rpc";
import { ctxSessionId, rpc } from "@mp/game";
import { RateLimiter } from "@mp/rate-limiter";

const globalRequestLimit = new RateLimiter({ points: 20, duration: 1 });

export const rateLimiterMiddleware = rpc.middleware(async ({ ctx }) => {
  const result = await globalRequestLimit.consume(ctx.get(ctxSessionId));
  if (result.isErr()) {
    throw new RPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Rate limit exceeded",
    });
  }
});
