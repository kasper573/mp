import type { ViewDistanceSettings } from "../visibility/view-distance";
import { Engine } from "@mp/engine";
import type { Application } from "@mp/graphics";
import { useGraphics } from "@mp/graphics/react";
import type { EntityId } from "@rift/core";
import type { ReadonlySignal, Signal } from "@preact/signals-core";
import { StorageSignal, untracked } from "@mp/state";
import { useSignal, useSignalEffect } from "@mp/state/react";
import { useState } from "preact/hooks";
import { Suspense } from "preact/compat";
import { Dock, ErrorFallback, LoadingSpinner } from "@mp/ui";
import type { ActorTextureLookup } from "../appearance/actor-texture-lookup";
import {
  AreaDebugSettingsForm,
  type AreaDebugSettings,
} from "../area/area-debug-settings-form";
import { AreaScene } from "../area/area-scene";
import { AreaUi } from "../area/area-ui";
import { AreaTag } from "../area/components";
import { claimedCharacterEntity } from "../character/signals";
import type { AreaId } from "@mp/fixtures";
import { RiftContext, type MpRiftClient } from "../client";
import {
  GameAssetLoaderContext,
  useActorTextures,
  useAreaAssets,
} from "./context";
import type { AreaAssets, GameAssetLoader } from "./asset-loader";
import { GameDebugUi } from "./debug-ui";
import { PendingQueriesDescription } from "./pending-queries-description";
import { useObjectSignal } from "./use-object-signal";

export interface GameRendererProps {
  client: MpRiftClient;
  assetLoader: GameAssetLoader;
  interactive: boolean;
  viewDistance: ViewDistanceSettings;
  enableUi?: boolean;
}

export function GameRenderer(props: GameRendererProps) {
  return (
    <RiftContext.Provider value={props.client}>
      <GameAssetLoaderContext.Provider value={props.assetLoader}>
        <Inner
          client={props.client}
          interactive={props.interactive}
          viewDistance={props.viewDistance}
          enableUi={props.enableUi}
        />
      </GameAssetLoaderContext.Provider>
    </RiftContext.Provider>
  );
}

interface InnerProps {
  client: MpRiftClient;
  interactive: boolean;
  viewDistance: ViewDistanceSettings;
  enableUi?: boolean;
}

function Inner(props: InnerProps) {
  const characterEntity = claimedCharacterEntity(props.client.world);

  if (props.client.state.value !== "open") {
    return (
      <LoadingSpinner debugDescription="rift client not connected">
        Connecting
      </LoadingSpinner>
    );
  }

  const entityId = characterEntity.value;
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
      <Stage
        client={props.client}
        characterEntity={characterEntity}
        areaIdToLoadAssetsFor={areaTag.areaId}
        interactive={props.interactive}
        viewDistance={props.viewDistance}
        enableUi={props.enableUi}
      />
    </Suspense>
  );
}

interface StageProps {
  client: MpRiftClient;
  characterEntity: ReadonlySignal<EntityId | undefined>;
  areaIdToLoadAssetsFor: AreaId;
  interactive: boolean;
  viewDistance: ViewDistanceSettings;
  enableUi?: boolean;
}

function Stage({
  client,
  characterEntity,
  areaIdToLoadAssetsFor,
  interactive,
  viewDistance,
  enableUi = true,
}: StageProps) {
  const areaAssets = useAreaAssets(areaIdToLoadAssetsFor);
  const actorTextures = useActorTextures();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const showDebugUi = useSignal(false);
  const appSignal = useGraphics(container);
  const optionsSignal = useObjectSignal({
    interactive,
    client,
    characterEntity,
    areaAssets,
    actorTextures,
    showDebugUi,
    viewDistance,
  });

  useSignalEffect(() => {
    const app = appSignal.value;
    if (app) {
      const options = optionsSignal.value;
      return untracked(() => buildStage(app, options));
    }
  });

  return (
    <>
      <div ref={setContainer} style={{ flex: 1 }} />
      {enableUi && (
        <Suspense fallback={<UILoadingFallback />}>
          <AreaUi characterEntity={characterEntity} />
          {showDebugUi.value && (
            <GameDebugUi>
              <AreaDebugSettingsForm signal={areaDebugSettingsStorage} />
            </GameDebugUi>
          )}
        </Suspense>
      )}
    </>
  );
}

function UILoadingFallback() {
  if (import.meta.env.DEV) {
    return (
      <Dock position="center">
        <ErrorFallback error="A part of the game UI is missing a suspense boundary, showing fallback." />
      </Dock>
    );
  }
  return null;
}

interface BuildStageOptions {
  interactive: boolean;
  client: MpRiftClient;
  characterEntity: ReadonlySignal<EntityId | undefined>;
  areaAssets: AreaAssets;
  actorTextures: ActorTextureLookup;
  showDebugUi: Signal<boolean>;
  viewDistance: ViewDistanceSettings;
}

function buildStage(app: Application, opt: BuildStageOptions) {
  const engine = new Engine(app.canvas);

  const subscriptions = [
    engine.start(opt.interactive),
    engine.keyboard.on(
      "keydown",
      "F2",
      () => (opt.showDebugUi.value = !opt.showDebugUi.value),
    ),
  ];
  const areaScene = new AreaScene({
    engine,
    debugSettings: () => areaDebugSettingsStorage.value,
    client: opt.client,
    characterEntity: opt.characterEntity,
    actorTextures: opt.actorTextures,
    area: opt.areaAssets.resource,
    areaSpritesheets: opt.areaAssets.spritesheets,
    viewDistance: opt.viewDistance,
  });
  app.stage.addChild(areaScene);
  return function cleanup() {
    app.stage.removeChildren();
    areaScene.destroy({ children: true });
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
  };
}

const areaDebugSettingsStorage = new StorageSignal<AreaDebugSettings>(
  "local",
  "area-debug-settings",
  {
    visibleGraphType: "none",
    showFogOfWar: false,
    showAttackRange: false,
    showAggroRange: false,
  },
);
