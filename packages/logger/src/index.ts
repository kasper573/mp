// oxlint-disable no-console
import pino, { type Logger as PinoLogger } from "pino";

export function createPinoLogger(pretty = true): Logger {
  return pino({
    transport: pretty
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
          },
        }
      : {
          // Outputs to stdout, not file
          // https://getpino.io/#/docs/transports?id=writing-to-a-custom-transport-amp-stdout
          target: "pino/file",
          options: { destination: 1 },
        },
  });
}

export function createConsoleLogger(): Logger {
  return {
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };
}

export type Logger = Pick<PinoLogger, "info" | "warn" | "error" | "debug">;
