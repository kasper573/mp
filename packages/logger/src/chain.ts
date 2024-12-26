import type { Logger } from "./logger";

/**
 * Creates a new logger that forwards logs to the given logger with a prefix.
 */
export function chain(base: Logger, prefix: string): Logger {
  return {
    error: (error) => base.error(new Error(prefix)), // TODO , { cause: error }
    info: (...args) => base.info(prefix, ...args),
    warn: (...args) => base.info(prefix, ...args),
  };
}
