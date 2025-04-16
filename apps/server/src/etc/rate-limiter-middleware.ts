import { RPCError } from "@mp/rpc";
import { ctxSessionId, rpc } from "@mp/game/server";
import { RateLimiter } from "@mp/rate-limiter";

const globalRequestLimit = new RateLimiter({ points: 20, duration: 1 });

export const rateLimiterMiddleware = rpc.middleware(async ({ ctx }) => {
  const result = await globalRequestLimit.consume(ctx.get(ctxSessionId));
  if (result.isErr()) {
    throw new RPCError("Rate limit exceeded");
  }
});
