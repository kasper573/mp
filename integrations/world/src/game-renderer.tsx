import type { AreaId } from "@mp/fixtures";
import { Engine } from "@mp/engine";
import type { Application } from "@mp/graphics";
import { useGraphics } from "@mp/graphics/react";
import type { Signal } from "@mp/state";
import { StorageSignal, untracked } from "@mp/state";
import { useSignal, useSignalEffect } from "@mp/state/react";
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import type { GameClient as RiftGameClient } from "@rift/modular";
import type { ActorTextureLookup } from "./modules/area/actor-texture-lookup";
import {
  AreaDebugSettingsForm,
  type AreaDebugSettings,
} from "./modules/area/area-debug-settings-form";
import { AreaScene } from "./modules/area/area-scene";
import { AreaUi } from "./modules/area/area-ui";
import { GameClientContext, useActorTextures, useAreaAssets } from "./context";
import type { AreaAssets } from "./game-asset-loader";
import { GameDebugUi } from "./game-debug-ui";
import { useObjectSignal } from "./use-object-signal";
import { Suspense } from "preact/compat";
import { Dock, ErrorFallback } from "@mp/ui";

interface GameRendererProps {
  interactive: boolean;
  gameClient: RiftGameClient;
  additionalDebugUi?: JSX.Element;
  areaIdToLoadAssetsFor: AreaId;
  enableUi?: boolean;
}

/**
 * Composes all game graphics and UI into a single component that renders the actual game.
 */
export function GameRenderer({
  interactive,
  gameClient,
  areaIdToLoadAssetsFor,
  additionalDebugUi,
  enableUi = true,
}: GameRendererProps) {
  const areaAssets = useAreaAssets(areaIdToLoadAssetsFor);
  const actorTextures = useActorTextures();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const showDebugUi = useSignal(false);
  const appSignal = useGraphics(container);
  const optionsSignal = useObjectSignal({
    interactive,
    gameClient,
    areaAssets,
    actorTextures,
    showDebugUi,
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
        <GameClientContext.Provider value={gameClient}>
          <Suspense fallback={<UILoadingFallback />}>
            <AreaUi />
            {showDebugUi.value && (
              <GameDebugUi>
                {additionalDebugUi}
                <AreaDebugSettingsForm signal={areaDebugSettingsStorage} />
              </GameDebugUi>
            )}
          </Suspense>
        </GameClientContext.Provider>
      )}
    </>
  );
}

/**
 * This suspense fallback is not expected to ever be shown.
 * It's a fallback to avoid a crash if a part of the game ui has forgotten to add its own suspense boundary.
 * It's important that every piece of ui in the game ui has its own fine grained suspense boundary,
 * because ie. we don't want the inventory triggering some async load to cause the HUD to show a loading state.
 */
function UILoadingFallback() {
  if (import.meta.env.DEV) {
    // In dev cause as much noise as possible to help catch missing suspense boundaries.
    return (
      <Dock position="center">
        <ErrorFallback error="A part of the game UI is missing a suspense boundary, showing fallback." />
      </Dock>
    );
  }

  // In production the most graceful thing we can do is to just show nothing.
  // Showing a generic loading spinner would just look bad, instead it's best to just show the game as-is.
  return null;
}

function buildStage(
  app: Application,
  opt: {
    interactive: boolean;
    gameClient: RiftGameClient;
    areaAssets: AreaAssets;
    actorTextures: ActorTextureLookup;
    showDebugUi: Signal<boolean>;
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
    gameClient: opt.gameClient,
    actorTextures: opt.actorTextures,
    area: opt.areaAssets.resource,
    areaSpritesheets: opt.areaAssets.spritesheets,
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
    showActorPaths: false,
    showFogOfWar: false,
    showAttackRange: false,
    showAggroRange: false,
  },
);
