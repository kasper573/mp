import type { SelectOption } from "@mp/ui";
import { LoadingSpinner } from "@mp/ui";
import { Select } from "@mp/ui";
import { Suspense, useEffect, useState } from "react";
import { useObservable } from "@mp/state/react";
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
  const [spectatedCharacterId, setSpectatedCharacterId] =
    useState<CharacterId>();
  const rpc = ioc.get(ctxGameRpcClient);
  const identity = useObservable(ioc.get(ctxAuthClient).identity);
  const characterOptions = rpc.world.characterList.useQuery({
    input: void 0,
    refetchInterval: 5000,
    enabled: !!identity,
    map: (result): SelectOption<CharacterId>[] => [
      { value: undefined as unknown as CharacterId, label: "Select character" },
      ...result.items.map(({ id, name }) => ({ value: id, label: name })),
    ],
  });

  const isSocketOpen = useObservable(props.stateClient.isConnected);

  useEffect(() => {
    if (isSocketOpen && identity && spectatedCharacterId) {
      props.stateClient.characterId.set(spectatedCharacterId);
      void rpc.world.spectate(spectatedCharacterId);
    }
  }, [isSocketOpen, identity, spectatedCharacterId]);

  return (
    <>
      <Select
        options={characterOptions.data ?? []}
        value={spectatedCharacterId}
        onChange={setSpectatedCharacterId}
      />

      <Suspense fallback={<LoadingSpinner debugId="SpectatorClient" />}>
        <GameClient {...props} interactive={props.interactive} />
      </Suspense>
    </>
  );
}
