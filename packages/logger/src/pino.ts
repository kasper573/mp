import pino from "pino";
import type { Logger } from "./abstract";

// We have a separate export for pino since it can only be used in Node.js environments

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
