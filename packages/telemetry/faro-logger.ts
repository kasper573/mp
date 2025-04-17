import { type Faro, LogLevel } from "@grafana/faro-web-sdk";
import type { LoggerEventHandler } from "@mp/logger";

/**
 * An integration between faro and @mp/logger
 */
export function faroLoggerHandler(faro: Faro): LoggerEventHandler {
  return (entry) => {
    switch (entry.type) {
      case "error":
        for (const error of determineErrors(entry.args)) {
          faro.api.pushError(error);
        }
        break;
      case "warn":
        return faro.api.pushLog(entry.args, { level: LogLevel.WARN });
      case "info":
        return faro.api.pushLog(entry.args, { level: LogLevel.INFO });
    }
  };
}

function determineErrors(args: unknown[]): Error[] {
  const errors = args.filter((a) => a instanceof Error);
  const nonErrors = args.filter((a) => !(a instanceof Error));
  if (nonErrors.length > 0) {
    errors.push(new Error(nonErrors.join(", ")));
  }
  return errors;
}
