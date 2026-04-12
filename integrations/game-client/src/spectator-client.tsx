import { Dock, LoadingSpinner } from "@mp/ui";
import { Suspense } from "preact/compat";
import type { GameClientProps } from "./game-client";
import { GameClient } from "./game-client";

export type SpectatorClientProps = GameClientProps;

/**
 * A `GameClient` that spectates the game without interaction.
 */
export function SpectatorClient(props: SpectatorClientProps) {
  return (
    <Suspense fallback={<LoadingSpinner debugDescription="SpectatorClient" />}>
      {props.stateClient.isGameReady.value ? (
        <GameClient enableUi={false} {...props} />
      ) : (
        <Dock position="center">Waiting for game state</Dock>
      )}
    </Suspense>
  );
}
