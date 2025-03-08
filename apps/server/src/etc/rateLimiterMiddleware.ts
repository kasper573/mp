import { type AnyMiddleware, TRPCError } from "@mp-modules/trpc";
import { ctx_sessionId } from "@mp-modules/user";
import { RateLimiter } from "@mp/rate-limiter";

const globalRequestLimit = new RateLimiter({ points: 20, duration: 1 });

export const rateLimiterMiddleware: AnyMiddleware = async ({ ctx, next }) => {
  const result = await globalRequestLimit.consume(
    ctx.injector.get(ctx_sessionId),
  );
  if (result.isErr()) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Rate limit exceeded",
    });
  }
  return next({ ctx });
};
