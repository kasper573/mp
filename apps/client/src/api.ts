import type { CharacterId, ClientStateUpdate } from "@mp/server";
import {
  serialization,
  tokenHeaderName,
  type ClientState,
  type ServerModules,
} from "@mp/server";
import { Client } from "@mp/network/client";
import { AuthClient } from "@mp/auth/client";
import { env } from "./env";
import { createEffect, createMemo, createSignal } from "solid-js";

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

export const [myCharacterId, setMyCharacterId] = createSignal<
  CharacterId | undefined
>(undefined);

export const myCharacter = createMemo(() =>
  api.state.characters.get(myCharacterId()!),
);

createEffect(() => {
  if (api.connected) {
    void api.modules.world.join().then(setMyCharacterId);
  } else {
    setMyCharacterId(undefined);
  }
});
