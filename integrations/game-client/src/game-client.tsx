import { Suspense, Show, createSignal, onCleanup } from "solid-js";
import { LoadingSpinner } from "@mp/ui";
import type { JSX } from "solid-js";
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
  // Create SolidJS signals to drive the UI
  const [isConnected, setIsConnected] = createSignal(
    props.stateClient.isConnected.get(),
  );
  const [isGameReady, setIsGameReady] = createSignal(
    props.stateClient.isGameReady.get(),
  );
  const [areaId, setAreaId] = createSignal(props.stateClient.areaId.get());

  // Poll the external signals periodically as a workaround for subscription issues
  // This ensures we pick up changes even if the reactive subscription chain is broken
  const pollInterval = setInterval(() => {
    setIsConnected(props.stateClient.isConnected.get());
    setIsGameReady(props.stateClient.isGameReady.get());
    setAreaId(props.stateClient.areaId.get());
  }, 100);

  onCleanup(() => {
    clearInterval(pollInterval);
  });

  return (
    <Show
      when={isConnected()}
      fallback={
        <LoadingSpinner debugDescription="GameStateClient not connected">
          Connecting to gateway
        </LoadingSpinner>
      }
    >
      <Show
        when={isGameReady()}
        fallback={
          <LoadingSpinner debugDescription="isGameReady false">
            Connecting to game service
          </LoadingSpinner>
        }
      >
        <Show
          when={areaId()}
          fallback={
            <LoadingSpinner debugDescription="areaId unavailable">
              Loading area
            </LoadingSpinner>
          }
        >
          {(areaId) => (
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
                areaIdToLoadAssetsFor={areaId()}
                enableUi={props.enableUi}
              />
            </Suspense>
          )}
        </Show>
      </Show>
    </Show>
  );
}
