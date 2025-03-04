import type { IRateLimiterOptions } from "rate-limiter-flexible";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { ResultAsync } from "@mp/std";
import { okAsync } from "@mp/std";

export type RateLimiterOptions = IRateLimiterOptions;

export class RateLimiter {
  private memoryLimiter: RateLimiterMemory;

  constructor(options: RateLimiterOptions) {
    this.memoryLimiter = new RateLimiterMemory(options);
  }

  consume(key: string): RateLimiterResult {
    if (RateLimiter.enabled === false) {
      return okAsync("skipped-due-to-disabled");
    }

    return ResultAsync.fromPromise(
      this.memoryLimiter.consume(key).then(() => "accepted"),
      String,
    );
  }

  /**
   * Enable or disable all rate limiting.
   * @internal This is a development feature and should not be used in production.
   */
  static enabled: boolean = true;
}

export type RateLimiterOK = "skipped-due-to-disabled" | "accepted";

export type RateLimiterResult = ResultAsync<RateLimiterOK, string>;
