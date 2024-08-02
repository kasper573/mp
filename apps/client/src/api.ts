import { Client, Logger } from "@mp/tse/client";
import type { ClientState, ServerModules } from "@mp/server";
import { env } from "./env";

export const api = new Client<ServerModules, ClientState>({
  url: env.serverUrl,
  logger: new Logger(console),
  disconnectedState: {
    characters: new Map(),
  },
});
