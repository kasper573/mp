import type { CharacterId, ClientStateUpdate } from "@mp/server";
import {
  serialization,
  tokenHeaderName,
  type ClientState,
  type ServerModules,
} from "@mp/server";
import { Client } from "@mp/network/client";
import { AuthClient } from "@mp/auth/client";
import { signal } from "@mp/state";
import { env } from "./env";

export const authClient = new AuthClient(env.auth.publishableKey);
const loadPromise = authClient.load();

export const api = new Client<ServerModules, ClientState, ClientStateUpdate>({
  url: env.serverUrl,
  rpcTimeout: 5000,
  createInitialState: () => ({ characters: new Map() }),
  parseStateUpdate: serialization.stateUpdate.parse,
  parseRPCResponse: serialization.rpc.parse,
  createNextState: (_, nextState) => nextState,
  serializeRPC: serialization.rpc.serialize,
  async getHeaders() {
    await loadPromise;
    return { [tokenHeaderName]: await authClient.session?.getToken() };
  },
});

export const myCharacterId = signal<CharacterId | undefined>(undefined);
api.connected.subscribe((connected) => {
  if (connected) {
    void api.modules.world.join().then((id) => (myCharacterId.value = id));
  } else {
    myCharacterId.value = undefined;
  }
});
