import { Suspense } from "preact/compat";
import { LoadingSpinner } from "@mp/ui";
import type { JSX } from "preact";
import type { GameStateClient } from "./game-state-client";
import { GameRenderer } from "./game-renderer";
import { PendingQueriesDescription } from "./pending-queries-description";

export interface GameClientProps {
  stateClient: GameStateClient;
  interactive: boolean;
  additionalDebugUi?: JSX.Element;
  enableUi?: boolean;
}

/**
 * A wrapper of `GameRenderer` that handles all async state loading and state management.
 * This allows the `GameRenderer` to focus on rendering the game, while this component
 * can focus on the data fetching and state management.
 */
export function GameClient(props: GameClientProps) {
  if (!props.stateClient.isConnected.value) {
    return (
      <LoadingSpinner debugDescription="GameStateClient not connected">
        Connecting to gateway
      </LoadingSpinner>
    );
  }

  if (!props.stateClient.isGameReady.value) {
    return (
      <LoadingSpinner debugDescription="isGameReady false">
        Connecting to game service
      </LoadingSpinner>
    );
  }

  const areaId = props.stateClient.areaId.value;
  if (!areaId) {
    return (
      <LoadingSpinner debugDescription="areaId unavailable">
        Loading area
      </LoadingSpinner>
    );
  }

  return (
    <Suspense
      fallback={
        <LoadingSpinner>
          Loading assets: <PendingQueriesDescription />
        </LoadingSpinner>
      }
    >
      <GameRenderer
        interactive={props.interactive}
        gameStateClient={props.stateClient}
        additionalDebugUi={props.additionalDebugUi}
        areaIdToLoadAssetsFor={areaId}
        enableUi={props.enableUi}
      />
    </Suspense>
  );
}
