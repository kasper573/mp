export async function withBackoffRetries<T>(
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
        throw err;
      }
      if (attempt >= options.warnAfter) {
        console.warn(
          `Operation failed ${attempt} times. Last error:`,
          err instanceof Error ? err : String(err),
        );
      }
      const delay = Math.min(
        options.maxDelay,
        options.initialDelay * Math.pow(options.factor, attempt - 1),
      );
      // oxlint-disable-next-line no-await-in-loop
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

const defaultOptions: WithBackoffRetriesOptions = {
  maxRetries: "infinite",
  initialDelay: 1000,
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
