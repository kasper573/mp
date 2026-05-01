import { Suspense } from "preact/compat";
import { LoadingSpinner } from "@mp/ui";
import type { JSX } from "preact";
import type { ReadonlySignal } from "@preact/signals-core";
import type { RiftClient } from "@rift/core";
import { GameRenderer } from "./game-renderer";
import { PendingQueriesDescription } from "./pending-queries-description";
import { isConnectedSignal } from "./signals";
import type { Character } from "./views";
import type { ViewDistanceSettings } from "../visibility/view-distance";

export interface GameClientProps {
  client: RiftClient;
  character: ReadonlySignal<Character | undefined>;
  interactive: boolean;
  additionalDebugUi?: JSX.Element;
  enableUi?: boolean;
  viewDistance: ViewDistanceSettings;
}

/**
 * Composes connection-state gating around `GameRenderer` so it can focus on
 * rendering once a character is available in a known area.
 */
export function GameClient(props: GameClientProps) {
  const isConnected = isConnectedSignal(props.client);

  if (!isConnected.value) {
    return (
      <LoadingSpinner debugDescription="rift client not connected">
        Connecting
      </LoadingSpinner>
    );
  }

  const character = props.character.value;
  if (!character) {
    return (
      <LoadingSpinner debugDescription="no character joined">
        Joining
      </LoadingSpinner>
    );
  }

  const areaId = character.areaId;
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
        client={props.client}
        character={props.character}
        interactive={props.interactive}
        additionalDebugUi={props.additionalDebugUi}
        areaIdToLoadAssetsFor={areaId}
        enableUi={props.enableUi}
        viewDistance={props.viewDistance}
      />
    </Suspense>
  );
}
