import type { Logger } from "@mp/logger";
import { createContext } from "preact";

export const LoggerContext = createContext<Logger>(
  new Proxy({} as Logger, {
    get() {
      throw new Error("LoggerContext must be provided");
    },
  }),
);
