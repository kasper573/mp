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
      const delay =
        options.initialDelay * Math.pow(options.factor, attempt - 1);
      // oxlint-disable-next-line no-await-in-loop
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

const defaultOptions: WithBackoffRetriesOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  factor: 2,
};

export interface WithBackoffRetriesOptions {
  maxRetries: number | "infinite";
  initialDelay: number;
  factor: number;
}
