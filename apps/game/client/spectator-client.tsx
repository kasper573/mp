import { Select } from "@mp/ui";
import { createSignal } from "solid-js";
import type { CharacterId } from "../server";

export function SpectatorClient() {
  const activeCharacters = [
    { label: "Player 1", value: "player1" as CharacterId },
    { label: "Player 2", value: "player2" as CharacterId },
    { label: "Player 3", value: "player3" as CharacterId },
  ];
  const [spectatedCharacterId, setSpectatedCharacterId] =
    createSignal<CharacterId>();
  return (
    <>
      <Select
        options={activeCharacters}
        value={spectatedCharacterId()}
        onChange={setSpectatedCharacterId}
      />
    </>
  );
}
