// oxlint-disable no-console
import type { Logger } from "./abstract";

export function createConsoleLogger(
  bindings?: Record<string, unknown>,
): Logger {
  // Use an args spread to avoid an ungly "undefined" being printed in some environments.
  const bindingArgs = bindings ? [bindings] : [];
  return {
    info: (...args: unknown[]) => console.info(...args, ...bindingArgs),
    warn: (...args: unknown[]) => console.warn(...args, ...bindingArgs),
    error: (...args: unknown[]) => console.error(...args, ...bindingArgs),
    debug: (...args: unknown[]) => console.debug(...args, ...bindingArgs),
    child: (childBindings) =>
      createConsoleLogger({ ...bindings, ...childBindings }),
  };
}
