import type { SelectOption } from "@mp/ui";
import { LoadingSpinner } from "@mp/ui";
import { Select } from "@mp/ui";
import { Suspense } from "preact/compat";
import { useSignal, useSignalEffect } from "@mp/state/react";
import { ctxGameEventClient } from "../network/game-event-client";
import { ioc } from "../context/ioc";
import { ctxAuthClient } from "../context/common";
import type { GameClientProps } from "./game-client";
import { GameClient } from "./game-client";
import type { CharacterId } from "../character/types";

/**
 * A `GameClient` that doesn't join the game, but instead spectates the selected player.
 * Also has additional UI for selecting spectator options.
 */
export function SpectatorClient(
  props: GameClientProps & { characterOptions: SelectOption<CharacterId>[] },
) {
  const spectatedCharacterId = useSignal<CharacterId>();
  const rpc = ioc.get(ctxGameEventClient);
  const auth = ioc.get(ctxAuthClient);

  useSignalEffect(() => {
    if (
      props.stateClient.isConnected.value &&
      auth.identity.value &&
      spectatedCharacterId.value
    ) {
      props.stateClient.characterId.value = spectatedCharacterId.value;
      void rpc.world.spectate(spectatedCharacterId.value);
    }
  });

  return (
    <>
      <Select options={props.characterOptions} signal={spectatedCharacterId} />

      <Suspense fallback={<LoadingSpinner debugId="SpectatorClient" />}>
        <GameClient {...props} interactive={props.interactive} />
      </Suspense>
    </>
  );
}
