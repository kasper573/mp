import { transformers, type ClientState, type ServerModules } from "@mp/server";
import { Client } from "@mp/network/client";
import { env } from "./env";

export const api = new Client<ServerModules, ClientState>({
  url: env.serverUrl,
  parseClientState: transformers.clientState.parse,
  serializeMessage: transformers.message.serialize,
  disconnectedState: {
    characters: new Map(),
  },
});
