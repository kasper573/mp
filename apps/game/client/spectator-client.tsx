import type { SelectOption } from "@mp/ui";
import { Select } from "@mp/ui";
import { createEffect, createMemo, createSignal, useContext } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import type { CharacterId } from "../server";
import { useRpc } from "./use-rpc";
import { Game } from "./game";
import { type GameStateClient } from "./game-state-client";

export function SpectatorClient(props: { gameState: GameStateClient }) {
  const [spectatedCharacterId, setSpectatedCharacterId] =
    createSignal<CharacterId>();
  const rpc = useRpc();
  const auth = useContext(AuthContext);
  const characterOptions = rpc.world.characterList.useQuery(() => ({
    input: void 0,
    refetchInterval: 5000,
    enabled: !!auth.identity(),
    map: (result): SelectOption<CharacterId>[] =>
      result.items.map(({ id, name }) => ({ value: id, label: name })),
  }));

  const isSocketOpen = createMemo(
    () => props.gameState.readyState() === WebSocket.OPEN,
  );

  createEffect(() => {
    const user = auth.identity();
    const characterId = spectatedCharacterId();
    if (isSocketOpen() && user && characterId) {
      void rpc.world.spectate(characterId);
    }
  });

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
