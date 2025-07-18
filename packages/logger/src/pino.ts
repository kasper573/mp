// oxlint-disable no-explicit-any
import pino from "pino";
import type { Logger } from "./abstract";

export function createPinoLogger(pretty: boolean): Logger {
  const logger = pino({
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

  const createLogFn =
    (pinoFn: typeof logger.info) =>
    (obj: any, msg?: string, ...args: any[]) => {
      if (typeof obj === "string") {
        pinoFn(obj, ...args);
      } else if (msg !== undefined) {
        pinoFn(obj, msg, ...args);
      } else {
        pinoFn(obj);
      }
    };

  return {
    info: createLogFn(logger.info.bind(logger)),
    warn: createLogFn(logger.warn.bind(logger)),
    error: createLogFn(logger.error.bind(logger)),
    debug: createLogFn(logger.debug.bind(logger)),
  };
}
