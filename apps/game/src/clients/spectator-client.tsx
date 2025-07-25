import type { SelectOption } from "@mp/ui";
import { LoadingSpinner } from "@mp/ui";
import { Select } from "@mp/ui";
import { Suspense } from "preact/compat";
import { useSignal, useSignalEffect } from "@mp/state/react";
import { ioc } from "../context/ioc";
import { ctxAuthClient } from "../context/common";
import type { GameClientProps } from "./game-client";
import { GameClient } from "./game-client";
import type { CharacterId } from "../character/types";

export interface SpectatorClientProps extends GameClientProps {
  characterOptions: SelectOption<CharacterId>[];
  sendSpectateRequest: (characterId: CharacterId) => void;
}

/**
 * A `GameClient` that doesn't join the game, but instead spectates the selected player.
 * Also has additional UI for selecting spectator options.
 */
export function SpectatorClient(props: SpectatorClientProps) {
  const spectatedCharacterId = useSignal<CharacterId>();
  const auth = ioc.get(ctxAuthClient);

  useSignalEffect(() => {
    if (
      props.stateClient.isConnected.value &&
      auth.identity.value &&
      spectatedCharacterId.value
    ) {
      props.stateClient.characterId.value = spectatedCharacterId.value;
      props.sendSpectateRequest(spectatedCharacterId.value);
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
