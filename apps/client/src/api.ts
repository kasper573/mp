import { Client } from "@mp/tse/client";
import { Logger } from "@mp/logger";
import { transformers, type ClientState, type ServerModules } from "@mp/server";
import { env } from "./env";

export const api = new Client<ServerModules, ClientState>({
  url: env.serverUrl,
  logger: new Logger(console),
  parseClientState: transformers.clientState.parse,
  serializeMessage: transformers.message.serialize,
  disconnectedState: {
    characters: new Map(),
  },
});
