import type { AreaId } from "@mp/db/types";
import { Engine } from "@mp/engine";
import type { Application } from "@mp/graphics";
import { useGraphics } from "@mp/graphics/react";
import type { Signal } from "@mp/state";
import { StorageSignal, untracked } from "@mp/state";
import { useSignal, useSignalEffect } from "@mp/state/react";
import type { JSX } from "preact";
import { useContext, useState } from "preact/hooks";
import {
  AreaDebugSettingsForm,
  type AreaDebugSettings,
} from "./area-debug-settings-form";
import { AreaScene } from "./area-scene";
import { AreaUi } from "./area-ui";
import { GameAssetLoaderContext, GameStateClientContext } from "./context";
import type { AreaAssets } from "./game-asset-loader";
import { GameDebugUi } from "./game-debug-ui";
import type { GameStateClient } from "./game-state-client";
import { useObjectSignal } from "./use-object-signal";

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
  const { useAreaAssets } = useContext(GameAssetLoaderContext);

  const assets = useAreaAssets(areaIdToLoadAssetsFor);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const showDebugUi = useSignal(false);
  const appSignal = useGraphics(container);
  const optionsSignal = useObjectSignal({
    interactive,
    gameStateClient,
    assets,
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
          <AreaUi />
          {showDebugUi.value && (
            <GameDebugUi>
              {additionalDebugUi}
              <AreaDebugSettingsForm signal={areaDebugSettingsStorage} />
            </GameDebugUi>
          )}
        </GameStateClientContext.Provider>
      )}
    </>
  );
}

function buildStage(
  app: Application,
  opt: {
    interactive: boolean;
    gameStateClient: GameStateClient;
    assets: AreaAssets;
    showDebugUi: Signal<boolean>;
  },
) {
  const engine = new Engine(app.canvas);
  const subscriptions = [
    engine.start(opt.interactive),
    engine.frameEmitter.subscribe(opt.gameStateClient.gameState.frameCallback),
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
    ...opt.assets,
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
