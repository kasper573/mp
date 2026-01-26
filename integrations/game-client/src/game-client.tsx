import { Show, Suspense } from "solid-js";
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
  return (
    <Show
      when={props.stateClient.isConnected.get()}
      fallback={
        <LoadingSpinner debugDescription="GameStateClient not connected">
          Connecting to gateway
        </LoadingSpinner>
      }
    >
      <Show
        when={props.stateClient.isGameReady.get()}
        fallback={
          <LoadingSpinner debugDescription="isGameReady false">
            Connecting to game service
          </LoadingSpinner>
        }
      >
        <Show
          when={props.stateClient.areaId.get()}
          keyed
          fallback={
            <LoadingSpinner debugDescription="areaId unavailable">
              Loading area
            </LoadingSpinner>
          }
        >
          {(currentAreaId) => (
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
                areaIdToLoadAssetsFor={currentAreaId}
                enableUi={props.enableUi}
              />
            </Suspense>
          )}
        </Show>
      </Show>
    </Show>
  );
}
