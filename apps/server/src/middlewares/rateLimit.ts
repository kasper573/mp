import type { IRateLimiterOptions } from "rate-limiter-flexible";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { t } from "../trpc";
import type { ServerContext } from "../context";

export function rateLimit(options: IRateLimiterOptions) {
  const limiter = new RateLimiterMemory(options);

  return t.middleware(async ({ ctx, next }) => {
    await consumeLimiterWithContext(limiter, ctx);
    return next({ ctx });
  });
}

export async function consumeLimiterWithContext(
  limiter: RateLimiterMemory,
  { sessionId }: ServerContext,
) {
  if (sessionId) {
    try {
      await limiter.consume(sessionId);
    } catch {
      throw new Error("Rate limit exceeded");
    }
  }
}
