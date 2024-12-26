export interface Logger {
  info: (...args: unknown[]) => unknown;
  warn: (...args: unknown[]) => unknown;
  error: (error: unknown) => unknown;
}

export type LogLevel = keyof Logger;
