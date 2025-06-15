import pino from "pino";
import type { LoggerEventHandler } from "./logger";

export function pinoLoggerHandler(): LoggerEventHandler {
  const logger = pino({
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
      },
    },
  });

  return (event) => logger[event.type](event.args.map(argToString).join(" "));
}

function argToString(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }
  return JSON.stringify(arg, null, 2);
}
