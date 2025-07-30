import { LoadingSpinner } from "@mp/ui";
import type { JSX } from "preact";
import { Suspense } from "preact/compat";
import { useEffect } from "preact/hooks";
import { GameRenderer } from "./game-renderer";
import { ctxGameStateClient, type GameStateClient } from "./game-state-client";
import { ioc } from "./ioc";

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
  const areaId = props.stateClient.areaId.value;

  useEffect(
    () => ioc.register(ctxGameStateClient, props.stateClient),
    [props.stateClient],
  );

  if (!props.stateClient.isConnected.value) {
    return <LoadingSpinner>Connecting to game server</LoadingSpinner>;
  }

  if (!areaId) {
    return (
      <LoadingSpinner debugId="areaId-unavailable">Loading area</LoadingSpinner>
    );
  }

  return (
    <Suspense fallback={<LoadingSpinner>Loading renderer</LoadingSpinner>}>
      <GameRenderer
        interactive={props.interactive}
        gameState={props.stateClient.gameState}
        additionalDebugUi={props.additionalDebugUi}
        areaIdToLoadAssetsFor={areaId}
        enableUi={props.enableUi}
      />
    </Suspense>
  );
}
