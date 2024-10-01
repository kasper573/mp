import type { CharacterId } from "@mp/server";
import { createEffect, createMemo, createSignal } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { env } from "../env";
import { api } from "./api";

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

export const useServerVersion = () =>
  createQuery(() => ({
    queryKey: ["server-version"],
    queryFn: () => api.modules.system.buildVersion(),
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
