// oxlint-disable no-explicit-any
// oxlint-disable no-console

export function createConsoleLogger(): Logger {
  return {
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };
}

export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
}

interface LogFn {
  <T extends object>(obj: T, msg?: string, ...args: any[]): void;
  (obj: unknown, msg?: string, ...args: any[]): void;
  (msg: string, ...args: any[]): void;
}
