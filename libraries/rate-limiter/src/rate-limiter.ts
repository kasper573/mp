import { okAsync, ResultAsync } from "@mp/std";
import type { IRateLimiterOptions } from "rate-limiter-flexible";
import { RateLimiterMemory } from "rate-limiter-flexible";

export type RateLimiterOptions = IRateLimiterOptions;

export class RateLimiter {
  private memoryLimiter: RateLimiterMemory;

  constructor(options: RateLimiterOptions) {
    this.memoryLimiter = new RateLimiterMemory(options);
  }

  consume(key: string): RateLimiterResult {
    if (!RateLimiter.enabled) {
      return okAsync("skipped-due-to-disabled");
    }

    return ResultAsync.fromPromise(
      this.memoryLimiter.consume(key).then(() => "accepted" as const),
      (error) =>
        new Error(`Rate limit exceeded for key: ${key}`, {
          cause: error,
        }),
    );
  }

  /**
   * Enable or disable all rate limiting.
   * @internal This is a development feature and should not be used in production.
   */
  static enabled = true;
}

export type RateLimiterOk = "skipped-due-to-disabled" | "accepted";

export type RateLimiterResult = ResultAsync<RateLimiterOk, Error>;
