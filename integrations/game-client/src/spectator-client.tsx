import type { CharacterId } from "@mp/game-shared";
import type { SelectOption } from "@mp/ui";
import { Dock, LoadingSpinner, Select } from "@mp/ui";
import { Suspense } from "preact/compat";
import type { GameClientProps } from "./game-client";
import { GameClient } from "./game-client";

export interface SpectatorClientProps extends GameClientProps {
  characterOptions: SelectOption<CharacterId>[];
}

/**
 * A `GameClient` that doesn't join the game, but instead spectates the selected player.
 * Also has additional UI for selecting spectator options.
 */
export function SpectatorClient(props: SpectatorClientProps) {
  return (
    <>
      <Select
        options={props.characterOptions}
        signal={props.stateClient.characterId}
      />

      <Suspense
        fallback={<LoadingSpinner debugDescription="SpectatorClient" />}
      >
        {props.stateClient.characterId.value ? (
          <GameClient enableUi={false} {...props} />
        ) : (
          <Dock position="center">No character selected</Dock>
        )}
      </Suspense>
    </>
  );
}
