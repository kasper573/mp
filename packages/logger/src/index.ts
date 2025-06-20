/* eslint-disable no-console */

import pino, { type Logger as PinoLogger } from "pino";

export function createPinoLogger(): Logger {
  return pino({
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
      },
    },
  });
}

export function createConsoleLogger(): Logger {
  return {
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
}

export type Logger = Pick<PinoLogger, "info" | "warn" | "error">;
