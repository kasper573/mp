import { type AnyMiddleware, TRPCError } from "@mp-modules/trpc/server";
import { ctxSessionId } from "@mp-modules/user";
import { RateLimiter } from "@mp/rate-limiter";

const globalRequestLimit = new RateLimiter({ points: 20, duration: 1 });

export const rateLimiterMiddleware: AnyMiddleware = async ({ ctx, next }) => {
  const result = await globalRequestLimit.consume(ctx.ioc.get(ctxSessionId));
  if (result.isErr()) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Rate limit exceeded",
    });
  }
  return next({ ctx });
};
