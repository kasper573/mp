import type { WorldState } from "@mp/server";
import { type CharacterId } from "@mp/server";
import { SyncClient } from "@mp/sync/client";
import { createMemo, createSignal } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { env } from "../env";
import { trpc } from "../clients/trpc";

export const syncClient = new SyncClient<WorldState>({
  initialState: { characters: {} },
  url: env.wsUrl,
});

const [worldState, setWorldState] = createSignal(syncClient.getState());

export { worldState };

syncClient.subscribe(setWorldState);

export const [myCharacterId, setMyCharacterId] = createSignal<
  CharacterId | undefined
>();

export const myCharacter = createMemo(
  () => worldState()?.characters[myCharacterId()!],
);

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
