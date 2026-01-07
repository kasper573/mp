import type { AreaId } from "@mp/game-shared";
import { Engine } from "@mp/engine";
import type { Application } from "@mp/graphics";
import { useGraphics } from "@mp/graphics/react";
import type { Signal } from "@mp/state";
import { StorageSignal, untracked } from "@mp/state";
import { useSignal, useSignalEffect } from "@mp/state/react";
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import type { ActorTextureLookup } from "./actor-texture-lookup";
import {
  AreaDebugSettingsForm,
  type AreaDebugSettings,
} from "./area-debug-settings-form";
import { AreaScene } from "./area-scene";
import { AreaUi } from "./area-ui";
import {
  GameStateClientContext,
  useActorTextures,
  useAreaAssets,
} from "./context";
import type { AreaAssets } from "./game-asset-loader";
import { GameDebugUi } from "./game-debug-ui";
import type { GameStateClient } from "./game-state-client";
import { useObjectSignal } from "./use-object-signal";
import { Suspense } from "preact/compat";
import { Dock, ErrorFallback } from "@mp/ui";
import { TimeSpan } from "@mp/time";

interface GameRendererProps {
  interactive: boolean;
  gameStateClient: GameStateClient;
  additionalDebugUi?: JSX.Element;
  areaIdToLoadAssetsFor: AreaId;
  enableUi?: boolean;
}

/**
 * Composes all game graphics and UI into a single component that renders the actual game.
 */
export function GameRenderer({
  interactive,
  gameStateClient,
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
    gameStateClient,
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
        <GameStateClientContext.Provider value={gameStateClient}>
          <Suspense fallback={<UILoadingFallback />}>
            <AreaUi />
            {showDebugUi.value && (
              <GameDebugUi>
                {additionalDebugUi}
                <AreaDebugSettingsForm signal={areaDebugSettingsStorage} />
              </GameDebugUi>
            )}
          </Suspense>
        </GameStateClientContext.Provider>
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
    gameStateClient: GameStateClient;
    areaAssets: AreaAssets;
    actorTextures: ActorTextureLookup;
    showDebugUi: Signal<boolean>;
  },
) {
  const engine = new Engine(app.canvas);

  function emitTickToGameState() {
    opt.gameStateClient.gameState.frameCallback(
      TimeSpan.fromMilliseconds(app.ticker.deltaMS),
    );
  }

  app.ticker.add(emitTickToGameState);
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
    state: opt.gameStateClient,
    actorTextures: opt.actorTextures,
    area: opt.areaAssets.resource,
    areaSpritesheets: opt.areaAssets.spritesheets,
  });
  app.stage.addChild(areaScene);
  return function cleanup() {
    app.ticker.remove(emitTickToGameState);
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
