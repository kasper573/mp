import type { Logger } from "@mp/logger";
import type { AuthClient } from "@mp/oauth/client";
import { createContext } from "preact";

export const LoggerContext = createContext(
  new Proxy({} as Logger, {
    get() {
      throw new Error("LoggerContext not provided");
    },
  }),
);

export const AuthContext = createContext(
  new Proxy({} as AuthClient, {
    get() {
      throw new Error("AuthContext not provided");
    },
  }),
);
