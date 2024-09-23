import type { CharacterId } from "@mp/server";
import { createEffect, createMemo, createSignal } from "solid-js";
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
