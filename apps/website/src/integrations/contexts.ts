import type { Logger } from "@mp/logger";
import type { AuthClient } from "@mp/auth/client";
import { createContext } from "solid-js";

export const LoggerContext = createContext<Logger>();

export const AuthContext = createContext<AuthClient>();
