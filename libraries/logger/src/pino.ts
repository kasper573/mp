// oxlint-disable no-explicit-any
import pino from "pino";
import type { Logger } from "./abstract";

interface Options {
  level?: pino.LevelWithSilentOrString;
  pretty?: boolean;
  bindings?: pino.Bindings;
}

export function createPinoLogger({
  level = "debug",
  pretty = true,
  bindings,
}: Options = {}): Logger {
  let logger = pino({
    level,
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

  // Our abstract Logger typescript signature expects bound methods
  logger.error = logger.error.bind(logger);
  logger.info = logger.info.bind(logger);
  logger.debug = logger.debug.bind(logger);
  logger.warn = logger.warn.bind(logger);

  if (bindings) {
    logger = logger.child(bindings);
  }

  return logger;
}
