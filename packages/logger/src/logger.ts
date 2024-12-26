import { composeError } from "./composeError";

export class Logger {
  private subscriptions = new Set<LoggerEventHandler>();

  info(...args: unknown[]) {
    this.emit({ type: "info", args });
  }

  warn(...args: unknown[]) {
    this.emit({ type: "warn", args });
  }

  error(...args: unknown[]) {
    this.emit({ type: "error", error: composeError(args) });
  }

  subscribe = (handler: LoggerEventHandler): Unsubscribe => {
    this.subscriptions.add(handler);
    return () => this.subscriptions.delete(handler);
  };

  private emit(event: LoggerEvent) {
    for (const handler of this.subscriptions) {
      handler(event);
    }
  }
}

export type LoggerFn = (...args: unknown[]) => unknown;

export type LogLevel = LoggerEvent["type"];

export type LoggerEventHandler = (event: LoggerEvent) => unknown;

export type LoggerEvent =
  | { type: "error"; error: Error }
  | { type: "info" | "warn"; args: unknown[] };

export type Unsubscribe = () => void;
