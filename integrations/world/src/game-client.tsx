import { Suspense } from "preact/compat";
import { LoadingSpinner } from "@mp/ui";
import type { JSX } from "preact";
import type { GameClient as RiftGameClient } from "@rift/modular";
import { GameRenderer } from "./game-renderer";
import { PendingQueriesDescription } from "./pending-queries-description";
import { sessionModule } from "./modules/session/module";

export interface GameClientProps {
  client: RiftGameClient;
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
  const session = props.client.using(sessionModule);

  if (!session.isConnected.value) {
    return (
      <LoadingSpinner debugDescription="GameClient not connected">
        Connecting to server
      </LoadingSpinner>
    );
  }

  if (!session.isGameReady.value) {
    return (
      <LoadingSpinner debugDescription="isGameReady false">
        Waiting for session
      </LoadingSpinner>
    );
  }

  const areaId = session.areaId.value;
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
        gameClient={props.client}
        additionalDebugUi={props.additionalDebugUi}
        areaIdToLoadAssetsFor={areaId}
        enableUi={props.enableUi}
      />
    </Suspense>
  );
}
