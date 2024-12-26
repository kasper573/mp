import type { Logger } from "./logger";

/**
 * Combines two loggers into one.
 */
export function combine(a: Logger, b: Logger): Logger {
  return {
    error: (...args) => {
      a.error(...args);
      b.error(...args);
    },
    info: (...args) => {
      a.info(...args);
      b.info(...args);
    },
    warn: (...args) => {
      a.warn(...args);
      b.warn(...args);
    },
  };
}
