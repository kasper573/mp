export async function tryUntilSuccess(
  operation: () => Promise<void>,
  options: {
    maxRetries: number;
    delay: number;
  },
) {
  const lastAttempt = options.maxRetries - 1;
  for (let n = 0; n <= lastAttempt; n++) {
    try {
      await operation();
    } catch (error) {
      if (n === lastAttempt) {
        throw error;
      }

      await wait(options.delay);
    }
  }
}

const wait = (n: number) => new Promise((resolve) => setTimeout(resolve, n));
