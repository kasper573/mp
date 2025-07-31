// oxlint-disable no-console
import type { Logger } from "./abstract";

export function createConsoleLogger(): Logger {
  return {
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };
}
