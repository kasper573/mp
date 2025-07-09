import type { SelectOption } from "@mp/ui";
import { LoadingSpinner } from "@mp/ui";
import { Select } from "@mp/ui";
import { createEffect, createSignal, Suspense } from "solid-js";
import { useObservable } from "@mp/state/solid";
import type { CharacterId } from "../../server";
import { ctxGameRpcClient } from "../game-rpc-client";
import { ioc } from "../context";
import { ctxAuthClient } from "../auth-context";
import type { GameClientProps } from "./game-client";
import { GameClient } from "./game-client";

/**
 * A `GameClient` that doesn't join the game, but instead spectates the selected player.
 * Also has additional UI for selecting spectator options.
 */
export function SpectatorClient(props: GameClientProps) {
  const [spectatedCharacterId, setSpectatedCharacterId] =
    createSignal<CharacterId>();
  const rpc = ioc.get(ctxGameRpcClient);
  const identity = useObservable(ioc.get(ctxAuthClient).identity);
  const characterOptions = rpc.world.characterList.useQuery(() => ({
    input: void 0,
    refetchInterval: 5000,
    enabled: !!identity(),
    map: (result): SelectOption<CharacterId>[] => [
      { value: undefined as unknown as CharacterId, label: "Select character" },
      ...result.items.map(({ id, name }) => ({ value: id, label: name })),
    ],
  }));

  const isSocketOpen = useObservable(() => props.stateClient.isConnected);

  createEffect(() => {
    const user = identity();
    const characterId = spectatedCharacterId();
    if (isSocketOpen() && user && characterId) {
      props.stateClient.characterId.set(characterId);
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

      <Suspense fallback={<LoadingSpinner debugId="SpectatorClient" />}>
        <div style={{ flex: 1, position: "relative" }}>
          <GameClient {...props} interactive={props.interactive} />
        </div>
      </Suspense>
    </>
  );
}
