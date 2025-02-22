import { createRateLimiterFactory } from "@mp/rate-limiter";
import { opt } from "./options.ts";

export const createRateLimiter = createRateLimiterFactory({
  enabled: opt.rateLimit,
});
