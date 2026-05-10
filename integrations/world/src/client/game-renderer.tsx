import type { AreaId } from "../identity/ids";
import type { ViewDistanceSettings } from "../visibility/view-distance";
import { Engine } from "@mp/engine";
import type { Application } from "@mp/graphics";
import { useGraphics } from "@mp/graphics/react";
import type { ReadonlySignal, Signal } from "@preact/signals-core";
import { StorageSignal, untracked } from "@mp/state";
import { useSignal, useSignalEffect } from "@mp/state/react";
import type { JSX } from "preact";
import type { EntityId } from "@rift/core";
import type { FeatureRiftClient } from "@rift/feature";
import { useState } from "preact/hooks";
import type { ActorTextureLookup } from "../appearance/actor-texture-lookup";
import {
  AreaDebugSettingsForm,
  type AreaDebugSettings,
} from "../area/area-debug-settings-form";
import { AreaScene } from "../area/area-scene";
import { AreaUi } from "../area/area-ui";
import { useActorTextures, useAreaAssets } from "./context";
import type { AreaAssets } from "./game-asset-loader";
import { GameDebugUi } from "./game-debug-ui";
import { useObjectSignal } from "./use-object-signal";
import { Suspense } from "preact/compat";
import { Dock, ErrorFallback } from "@mp/ui";

interface GameRendererProps {
  interactive: boolean;
  client: FeatureRiftClient;
  characterEntity: ReadonlySignal<EntityId | undefined>;
  additionalDebugUi?: JSX.Element;
  areaIdToLoadAssetsFor: AreaId;
  enableUi?: boolean;
  viewDistance: ViewDistanceSettings;
}

export function GameRenderer({
  interactive,
  client,
  characterEntity,
  areaIdToLoadAssetsFor,
  additionalDebugUi,
  enableUi = true,
  viewDistance,
}: GameRendererProps) {
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
              {additionalDebugUi}
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

function buildStage(
  app: Application,
  opt: {
    interactive: boolean;
    client: FeatureRiftClient;
    characterEntity: ReadonlySignal<EntityId | undefined>;
    areaAssets: AreaAssets;
    actorTextures: ActorTextureLookup;
    showDebugUi: Signal<boolean>;
    viewDistance: ViewDistanceSettings;
  },
) {
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
