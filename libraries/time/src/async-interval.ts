import type { TimeSpan } from "./timespan";

/**
 * Like `setInterval`, but the callback is a Promise.
 * The interval will not start until the previous Promise resolves.
 * The duration of the callback will be deducted from the next interval.
 */
export function startAsyncInterval(
  callback: () => Promise<unknown>,
  interval: TimeSpan,
): AsyncIntervalSession {
  let stopped = false;
  let timeoutId: ReturnType<typeof setTimeout>;

  async function run() {
    const start = performance.now();
    try {
      await callback();
    } finally {
      if (!stopped) {
        const elapsed = performance.now() - start;
        const delay = Math.max(0, interval.totalMilliseconds - elapsed);
        timeoutId = setTimeout(run, delay);
      }
    }
  }

  timeoutId = setTimeout(run, interval.totalMilliseconds);

  /**
   * Forcefully runs the callback immediately, regardless of interval timing.
   */
  function flush() {
    clearInterval(timeoutId);
    return run();
  }

  function stop() {
    stopped = true;
    clearTimeout(timeoutId);
  }

  return { flush, stop };
}

export interface AsyncIntervalSession {
  flush: () => Promise<void>;
  stop: () => void;
}
