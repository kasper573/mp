import type { SelectOption } from "@mp/ui";
import { Select } from "@mp/ui";
import { createSignal } from "solid-js";
import type { CharacterId } from "../server";
import { useRpc } from "./use-rpc";
import { Game } from "./game";
import type { GameStateClient } from "./game-state-client";

export function SpectatorClient(props: { gameState: GameStateClient }) {
  const [spectatedCharacterId, setSpectatedCharacterId] =
    createSignal<CharacterId>();
  const rpc = useRpc();
  const characterOptions = rpc.world.characterList.useQuery(() => ({
    input: void 0,
    refetchInterval: 5000,
    map: (result): SelectOption<CharacterId>[] =>
      result.items.map(({ id, name }) => ({ value: id, label: name })),
  }));
  return (
    <>
      <Select
        options={characterOptions.data ?? []}
        value={spectatedCharacterId()}
        onChange={setSpectatedCharacterId}
      />

      <Game interactive={false} gameState={props.gameState} />
    </>
  );
}
