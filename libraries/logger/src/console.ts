import type { LoggerEventHandler } from "./logger";

export function consoleLoggerHandler(
  target: typeof console,
): LoggerEventHandler {
  return (event) => {
    switch (event.type) {
      case "error":
        return target.error(event.error);
      case "warn":
        return target.warn(...event.args);
      case "info":
        return target.info(...event.args);
    }
  };
}
