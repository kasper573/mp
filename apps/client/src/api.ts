import { transformers, type ClientState, type ServerModules } from "@mp/server";
import { Client } from "@mp/network/client";
import { env } from "./env";

export const api = new Client<ServerModules, ClientState, ClientState>({
  url: env.serverUrl,
  parseStateUpdate: transformers.clientState.parse,
  createNextState: (_, nextState) => nextState,
  serializeMessage: transformers.message.serialize,
  createDisconnectedState: () => ({ characters: new Map() }),
});
