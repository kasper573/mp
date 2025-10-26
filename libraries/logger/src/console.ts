// oxlint-disable no-console
import type { Logger } from "./abstract";

export function createConsoleLogger(
  bindings?: Record<string, unknown>,
): Logger {
  return {
    info: (...args: unknown[]) => console.info(...args, bindings),
    warn: (...args: unknown[]) => console.warn(...args, bindings),
    error: (...args: unknown[]) => console.error(...args, bindings),
    debug: (...args: unknown[]) => console.debug(...args, bindings),
    child: (childBindings) =>
      createConsoleLogger({ ...bindings, ...childBindings }),
  };
}
