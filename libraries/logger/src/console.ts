// oxlint-disable no-console
import type { Logger, LoggerChildOptions } from "./abstract";

export function createConsoleLogger(
  bindings?: Record<string, unknown>,
  opt?: LoggerChildOptions,
): Logger {
  // Use an args spread to avoid an ungly "undefined" being printed in some environments.
  const bindingArgs = bindings ? [bindings] : [];
  const prefixArgs = opt?.msgPrefix !== undefined ? [opt.msgPrefix] : [];
  return {
    info: (...args: unknown[]) =>
      console.info(...prefixArgs, ...args, ...bindingArgs),
    warn: (...args: unknown[]) =>
      console.warn(...prefixArgs, ...args, ...bindingArgs),
    error: (...args: unknown[]) =>
      console.error(...prefixArgs, ...args, ...bindingArgs),
    debug: (...args: unknown[]) =>
      console.debug(...prefixArgs, ...args, ...bindingArgs),
    child: (childBindings, opt) =>
      createConsoleLogger({ ...bindings, ...childBindings }, opt),
  };
}
