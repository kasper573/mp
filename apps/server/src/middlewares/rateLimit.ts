import type { IRateLimiterOptions } from "rate-limiter-flexible";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { TRPCError } from "@trpc/server";
import { t } from "../trpc";
import type { ServerContext } from "../context";

export function rateLimit(options: IRateLimiterOptions) {
  const limiter = new RateLimiterMemory(options);

  return t.middleware(async ({ ctx, next }) => {
    await consumeLimiterForTRPC(limiter, ctx);
    return next({ ctx });
  });
}

export async function consumeLimiterForTRPC(
  limiter: RateLimiterMemory,
  { sessionId }: ServerContext,
) {
  if (sessionId) {
    try {
      await limiter.consume(sessionId);
    } catch (error) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded: ${String(error)}`,
      });
    }
  }
}
