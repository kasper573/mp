import type { WorldState } from "@mp/server";
import { type CharacterId } from "@mp/server";
import type { StateUpdate } from "@mp/transformer";
import { createClientCRDT } from "@mp/transformer";
import { createEffect, createMemo, createSignal } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { env } from "../env";
import { trpc } from "../clients/trpc";

const crdt = createClientCRDT<WorldState>({ characters: {} });

const [worldState, setWorldState] = createSignal(crdt.access());

export { worldState };

export function applyWorldStateUpdate(update: StateUpdate) {
  crdt.update(update);
  const doc = crdt.access();
  setWorldState(doc);
}

export const [myCharacterId, setMyCharacterId] = createSignal<
  CharacterId | undefined
>();

export const myCharacter = createMemo(
  () => worldState().characters[myCharacterId()!],
);

export const [connected, setConnected] = createSignal(false);

createEffect(() => {
  if (connected()) {
    void trpc.world.join.mutate().then(setMyCharacterId);
  } else {
    setMyCharacterId(undefined);
  }
});

export const useServerVersion = () =>
  createQuery(() => ({
    queryKey: ["server-version"],
    queryFn: () => trpc.system.buildVersion.query(),
  }));

export const useVersionCompatibility = () => {
  const serverVersion = useServerVersion();
  const compatibility = createMemo(() => {
    if (serverVersion.status === "success") {
      return env.buildVersion === serverVersion.data
        ? "compatible"
        : "incompatible";
    }
    return "indeterminate";
  });

  return compatibility;
};
