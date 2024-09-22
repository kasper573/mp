import type { CharacterId, ClientStateUpdate } from "@mp/server";
import {
  serialization,
  tokenHeaderName,
  type ClientState,
  type ServerModules,
} from "@mp/server";
import { Client } from "@mp/network/client";
import { AuthClient } from "@mp/auth/client";
import { createEffect, createMemo, createSignal } from "solid-js";
import { env } from "./env";

export const authClient = new AuthClient(env.auth.publishableKey);
const loadPromise = authClient.load();

export const api = new Client<ServerModules, ClientState, ClientStateUpdate>({
  url: env.serverUrl,
  rpcTimeout: 5000,
  createInitialState: () => ({ characters: new Map() }),
  parseStateUpdate: serialization.stateUpdate.parse,
  parseRPCResponse: serialization.rpc.parse,
  applyStateUpdate,
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

function applyStateUpdate(state: ClientState, update: ClientStateUpdate) {
  const prevCharacterIds = new Set(state.characters.keys());
  const nextCharacterIds = new Set(update.characters.keys());

  for (const removedId of prevCharacterIds.difference(nextCharacterIds)) {
    state.characters.delete(removedId);
  }

  for (const addedId of nextCharacterIds.difference(prevCharacterIds)) {
    state.characters.set(addedId, update.characters.get(addedId)!);
  }

  for (const updatedId of prevCharacterIds.intersection(nextCharacterIds)) {
    const existing = state.characters.get(updatedId)!;
    const updated = update.characters.get(updatedId)!;
    if (isStructurallyEqual(existing, updated)) {
      continue;
    }
    const { coords, ...rest } = updated;
    existing.coords.x = coords.x;
    existing.coords.y = coords.y;
    Object.assign(existing, rest);
  }
}

function isStructurallyEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
