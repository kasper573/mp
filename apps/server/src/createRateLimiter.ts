import { createRateLimiterFactory } from "@mp/rate-limiter";
import { opt } from "./options";

export const createRateLimiter = createRateLimiterFactory({
  enabled: opt.rateLimit,
});
