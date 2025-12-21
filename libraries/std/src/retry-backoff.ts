export async function withBackoffRetries<T>(
  debugId: string,
  fn: () => Promise<T>,
  options = defaultOptions,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      return await fn();
    } catch (err) {
      attempt++;
      if (options.maxRetries !== "infinite" && attempt > options.maxRetries) {
        throw new Error(
          `Operation "${debugId}" failed after ${attempt - 1} retries`,
          { cause: err },
        );
      }

      const delay = Math.min(
        options.maxDelay,
        options.initialDelay * Math.pow(options.factor, attempt - 1),
      );

      if (attempt >= options.warnAfter) {
        // oxlint-disable-next-line no-console
        console.warn(
          `Operation "${debugId}" failed on attempt ${attempt}, retrying in ${delay}ms...`,
          err,
        );
      }

      // oxlint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

const defaultOptions: WithBackoffRetriesOptions = {
  maxRetries: "infinite",
  initialDelay: 500,
  maxDelay: 30000,
  factor: 2,
  warnAfter: 4,
};

export interface WithBackoffRetriesOptions {
  maxRetries: number | "infinite";
  initialDelay: number;
  maxDelay: number;
  factor: number;
  warnAfter: number;
}
