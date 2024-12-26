import type { Logger } from "@mp/logger";
import { BrowserErrorTracer, collect, combine } from "@mp/logger";
import { createContext } from "solid-js";
import { trpc } from "./clients/trpc";
import { env } from "./env";

export class ClientLogger implements Logger {
  private logger = combine(console, traceLogger());
  private tracer = new BrowserErrorTracer(window, this.logger.error);

  error = this.logger.error.bind(this.logger);
  info = this.logger.info.bind(this.logger);
  warn = this.logger.warn.bind(this.logger);

  start() {
    this.tracer.start();
  }

  stop() {
    this.tracer.stop();
  }
}

export const LoggerContext = createContext<Logger>(
  new Proxy({} as Logger, {
    get() {
      throw new Error("LoggerContext must be provided");
    },
  }),
);

function traceLogger() {
  return collect(async (entry) => {
    try {
      await trpc.system.trace.mutate({ buildVersion: env.buildVersion, entry });
    } catch {
      // If log tracing fails we need to ignore the error to avoid infinite loops
    }
  });
}
