// oxlint-disable no-explicit-any
import pino from "pino";
import type { Logger } from "./abstract";

export function createPinoLogger(pretty: boolean): Logger {
  return pino({
    level: "debug",
    ...(pretty && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    }),
  });
}
