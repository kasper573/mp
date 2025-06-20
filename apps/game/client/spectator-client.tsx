import type { SelectOption } from "@mp/ui";
import { Select } from "@mp/ui";
import { createSignal } from "solid-js";
import type { CharacterId } from "../server";
import { useRpc } from "./use-rpc";

export function SpectatorClient() {
  const [spectatedCharacterId, setSpectatedCharacterId] =
    createSignal<CharacterId>();
  const rpc = useRpc();
  const characterOptions = rpc.world.characterList.useQuery(() => ({
    input: void 0,
    map: (result): SelectOption<CharacterId>[] => {
      return result.items.map((character) => ({
        value: character.id,
        label: character.name,
      }));
    },
  }));
  return (
    <>
      <Select
        options={characterOptions.data ?? []}
        value={spectatedCharacterId()}
        onChange={setSpectatedCharacterId}
      />
    </>
  );
}
