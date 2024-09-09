import type { CharacterId, ClientStateUpdate } from "@mp/server";
import {
  serialization,
  type ClientState,
  type ServerModules,
} from "@mp/server";
import { Client } from "@mp/network/client";
import { AuthClient } from "@mp/auth/client";
import { env } from "./env";

export const authClient = new AuthClient(env.auth.publishableKey);
const loadPromise = authClient.load();

// TODO this should not be a singleton
export const api = new Client<ServerModules, ClientState, ClientStateUpdate>({
  url: env.serverUrl,
  rpcTimeout: 5000,
  createInitialState: () => ({ characters: new Map() }),
  parseStateUpdate: serialization.stateUpdate.parse,
  parseRPCResponse: serialization.rpc.parse,
  createNextState: (_, nextState) => nextState,
  serializeRPC: serialization.rpc.serialize,
  async getAuth() {
    await loadPromise;
    const token = await authClient.session?.getToken();
    return token ? { token } : undefined;
  },
});

export function getMyFakeCharacterId(): CharacterId {
  return authClient.user?.id as CharacterId;
}
