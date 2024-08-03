import type { ClientStateUpdate } from "@mp/server";
import { transformers, type ClientState, type ServerModules } from "@mp/server";
import { Client } from "@mp/network/client";
import { env } from "./env";

export const api = new Client<ServerModules, ClientState, ClientStateUpdate>({
  url: env.serverUrl,
  createInitialState: () => ({ characters: new Map() }),
  parseStateUpdate: transformers.stateUpdate.parse,
  createNextState: (_, nextState) => nextState,
  serializeMessage: transformers.message.serialize,
});
