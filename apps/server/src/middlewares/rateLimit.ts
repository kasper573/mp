import { TRPCError } from "@trpc/server";
import type { RateLimiter, RateLimiterOptions } from "@mp/rate-limiter";
import { t } from "../trpc";
import type { ServerContext } from "../context";
import { createRateLimiter } from "../createRateLimiter";

export function rateLimit(options: RateLimiterOptions) {
  const limiter = createRateLimiter(options);

  return t.middleware(async ({ ctx, next }) => {
    await consumeLimiterForTRPC(limiter, ctx);
    return next({ ctx });
  });
}

export async function consumeLimiterForTRPC(
  limiter: RateLimiter,
  { sessionId }: ServerContext,
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
