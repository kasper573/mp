import type { Faro } from "@grafana/faro-web-sdk";
import { LogLevel } from "@grafana/faro-web-sdk";
import type { LoggerEventHandler } from "@mp/logger";

/**
 * An intergation between faro and @mp/logger
 */
export function faroLoggerHandler(faro: Faro): LoggerEventHandler {
  return (entry) => {
    switch (entry.type) {
      case "error":
        return faro.api.pushError(entry.error);
      case "warn":
        return faro.api.pushLog(entry.args, { level: LogLevel.WARN });
      case "info":
        return faro.api.pushLog(entry.args, { level: LogLevel.INFO });
    }
  };
}
