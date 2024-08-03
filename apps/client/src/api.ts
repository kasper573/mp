import type { ClientStateUpdate } from "@mp/server";
import {
  serialization,
  type ClientState,
  type ServerModules,
} from "@mp/server";
import { Client } from "@mp/network/client";
import { env } from "./env";

export const api = new Client<ServerModules, ClientState, ClientStateUpdate>({
  url: env.serverUrl,
  createInitialState: () => ({ characters: new Map() }),
  parseStateUpdate: serialization.stateUpdate.parse,
  parseRPCOutput: serialization.rpc.parse,
  createNextState: (_, nextState) => nextState,
  serializeRPC: serialization.rpc.serialize,
});
