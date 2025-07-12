import type { SelectOption } from "@mp/ui";
import { LoadingSpinner } from "@mp/ui";
import { Select } from "@mp/ui";
import { Suspense } from "react";
import { useSignal, useSignalEffect } from "@mp/state/react";
import type { CharacterId } from "../../server";
import { ctxGameRpcClient } from "../game-rpc-client";
import { ioc } from "../context/ioc";
import { ctxAuthClient } from "../context/common";
import type { GameClientProps } from "./game-client";
import { GameClient } from "./game-client";

/**
 * A `GameClient` that doesn't join the game, but instead spectates the selected player.
 * Also has additional UI for selecting spectator options.
 */
export function SpectatorClient(props: GameClientProps) {
  const spectatedCharacterId = useSignal<CharacterId>();
  const rpc = ioc.get(ctxGameRpcClient);
  const auth = ioc.get(ctxAuthClient);
  const characterOptions = rpc.world.characterList.useQuery({
    input: void 0,
    refetchInterval: 5000,
    enabled: !!auth.identity.get(),
    map: (result): SelectOption<CharacterId>[] => [
      { value: undefined as unknown as CharacterId, label: "Select character" },
      ...result.items.map(({ id, name }) => ({ value: id, label: name })),
    ],
  });

  useSignalEffect(() => {
    if (
      props.stateClient.isConnected.get() &&
      auth.identity.get() &&
      spectatedCharacterId.value
    ) {
      props.stateClient.characterId.set(spectatedCharacterId.value);
      void rpc.world.spectate(spectatedCharacterId.value);
    }
  });

  return (
    <>
      <Select
        options={characterOptions.data ?? []}
        value={spectatedCharacterId.value}
        onChange={(v) => (spectatedCharacterId.value = v)}
      />

      <Suspense fallback={<LoadingSpinner debugId="SpectatorClient" />}>
        <GameClient {...props} interactive={props.interactive} />
      </Suspense>
    </>
  );
}
