// oxlint-disable no-explicit-any
import pino from "pino";
import type { Logger } from "./abstract";

export function createPinoLogger(
  pretty: boolean,
  bindings?: pino.Bindings,
): Logger {
  let logger = pino({
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

  if (bindings) {
    logger = logger.child(bindings);
  }

  return logger;
}
