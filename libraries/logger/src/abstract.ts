// oxlint-disable no-explicit-any
export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
  child: (
    bindings: Record<string, unknown>,
    opt?: LoggerChildOptions,
  ) => Logger;
}

export interface LoggerChildOptions {
  msgPrefix?: string;
}

interface LogFn {
  <T extends object>(obj: T, msg?: string, ...args: any[]): void;
  (obj: unknown, msg?: string, ...args: any[]): void;
  (msg: string, ...args: any[]): void;
}
