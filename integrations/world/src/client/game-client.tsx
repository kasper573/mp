import { Suspense } from "preact/compat";
import { LoadingSpinner } from "@mp/ui";
import type { JSX } from "preact";
import type { ReadonlySignal } from "@preact/signals-core";
import type { EntityId } from "@rift/core";
import type { FeatureRiftClient } from "@rift/feature";
import { GameRenderer } from "./game-renderer";
import { PendingQueriesDescription } from "./pending-queries-description";
import { isConnectedSignal } from "./signals";
import { AreaTag } from "../area/components";
import type { ViewDistanceSettings } from "../visibility/view-distance";

export interface GameClientProps {
  client: FeatureRiftClient;
  characterEntity: ReadonlySignal<EntityId | undefined>;
  interactive: boolean;
  additionalDebugUi?: JSX.Element;
  enableUi?: boolean;
  viewDistance: ViewDistanceSettings;
}

export function GameClient(props: GameClientProps) {
  const isConnected = isConnectedSignal(props.client);

  if (!isConnected.value) {
    return (
      <LoadingSpinner debugDescription="rift client not connected">
        Connecting
      </LoadingSpinner>
    );
  }

  const entityId = props.characterEntity.value;
  if (entityId === undefined) {
    return (
      <LoadingSpinner debugDescription="no character joined">
        Joining
      </LoadingSpinner>
    );
  }

  const areaTag = props.client.world.signal.get(entityId, AreaTag).value;
  if (!areaTag) {
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
        characterEntity={props.characterEntity}
        interactive={props.interactive}
        additionalDebugUi={props.additionalDebugUi}
        areaIdToLoadAssetsFor={areaTag.areaId}
        enableUi={props.enableUi}
        viewDistance={props.viewDistance}
      />
    </Suspense>
  );
}
