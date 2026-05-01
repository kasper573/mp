import type { CharacterId } from "../identity/ids";
import type { SelectOption } from "@mp/ui";
import { Dock, LoadingSpinner, Select } from "@mp/ui";
import type { Signal } from "@preact/signals-core";
import { Suspense } from "preact/compat";
import type { GameClientProps } from "../client/game-client";
import { GameClient } from "../client/game-client";

export interface SpectatorClientProps extends GameClientProps {
  characterOptions: SelectOption<CharacterId | undefined>[];
  spectatedId: Signal<CharacterId | undefined>;
}

export function SpectatorClient(props: SpectatorClientProps) {
  return (
    <>
      <Select<CharacterId | undefined>
        options={props.characterOptions}
        signal={props.spectatedId}
      />

      <Suspense
        fallback={<LoadingSpinner debugDescription="SpectatorClient" />}
      >
        {props.spectatedId.value ? (
          <GameClient enableUi={false} {...props} />
        ) : (
          <Dock position="center">No character selected</Dock>
        )}
      </Suspense>
    </>
  );
}
