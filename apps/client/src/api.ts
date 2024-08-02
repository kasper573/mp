import { Client, Logger } from "@mp/tse/client";
import { transformers, type ClientState, type ServerModules } from "@mp/server";
import { env } from "./env";

export const api = new Client<ServerModules, ClientState>({
  url: env.serverUrl,
  logger: new Logger(console),
  transformers,
  disconnectedState: {
    characters: new Map(),
  },
});
