import { TRPCError } from "@trpc/server";
import type { RateLimiter, RateLimiterOptions } from "@mp/rate-limiter";
import { sessionIdContext, type SessionId } from "@mp-modules/user";
import { t } from "../trpc";
import { createRateLimiter } from "../createRateLimiter";

export function rateLimit(options: RateLimiterOptions) {
  const limiter = createRateLimiter(options);

  return t.middleware(async ({ ctx, next }) => {
    await consumeLimiterForTRPC(limiter, ctx.injector.get(sessionIdContext));
    return next({ ctx });
  });
}

export async function consumeLimiterForTRPC(
  limiter: RateLimiter,
  sessionId: SessionId | undefined,
) {
  if (sessionId) {
    const result = await limiter.consume(sessionId);
    if (result.isErr()) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded: ${String(result.error)}`,
      });
    }
  }
}
