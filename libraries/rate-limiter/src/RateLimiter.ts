import type { IRateLimiterOptions } from "rate-limiter-flexible";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { ResultAsync } from "@mp/std";
import { okAsync } from "@mp/std";

export interface RateLimiterOptions extends IRateLimiterOptions {
  enabled?: boolean;
}

export function createRateLimiterFactory(
  baseOptions: Partial<RateLimiterOptions>,
) {
  return function createRateLimiter(options: RateLimiterOptions): RateLimiter {
    return new RateLimiter({
      ...baseOptions,
      ...options,
    });
  };
}

class RateLimiter {
  private memoryLimiter: RateLimiterMemory;

  constructor(private options: RateLimiterOptions) {
    this.memoryLimiter = new RateLimiterMemory(options);
  }

  consume(key: string): RateLimiterResult {
    if (this.options.enabled === false) {
      return okAsync("skipped-due-to-disabled");
    }

    return ResultAsync.fromPromise(
      this.memoryLimiter.consume(key).then(() => "accepted"),
      String,
    );
  }
}

export type RateLimiterOK = "skipped-due-to-disabled" | "accepted";

export type RateLimiterResult = ResultAsync<RateLimiterOK, string>;

export { type RateLimiter };
