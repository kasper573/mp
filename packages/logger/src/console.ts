import type { LoggerEventHandler } from "./logger";

export function consoleLoggerHandler(
  target: typeof console,
): LoggerEventHandler {
  return (event) => target[event.type](...event.args);
}
