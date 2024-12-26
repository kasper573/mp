import type { LogLevel } from "./logger";
import type { Logger } from "./logger";

/**
 * Creates a new logger that collects logs of all types and forwards them to the given function
 */
export function collect(fn: CollectFn): Logger {
  return {
    error: (...args) => fn({ type: "error", args }),
    info: (...args) => fn({ type: "info", args }),
    warn: (...args) => fn({ type: "warn", args }),
  };
}

export type CollectFn<Result = unknown> = <Type extends LogLevel>(
  entry: LogEntry,
) => Result;

export type LogEntry = {
  [Type in LogLevel]: {
    type: Type;
    args: Parameters<Logger[Type]>;
  };
}[LogLevel];
