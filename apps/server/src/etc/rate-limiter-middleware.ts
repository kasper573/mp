import { ctxGameplaySession, evt } from "@mp/game/server";
import { RateLimiter } from "@mp/rate-limiter";

const globalRequestLimit = new RateLimiter({ points: 20, duration: 1 });

export const rateLimiterMiddleware = evt.middleware(async ({ ctx }) => {
  const result = await globalRequestLimit.consume(
    ctx.get(ctxGameplaySession).userId,
  );
  if (result.isErr()) {
    throw new Error("Rate limit exceeded");
  }
});
