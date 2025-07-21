import { Engine } from "@mp/engine";
import type { JSX } from "preact";
import { useContext, useState } from "preact/hooks";
import type { Signal } from "@mp/state";
import { StorageSignal, untracked } from "@mp/state";
import { useGraphics } from "@mp/graphics/react";
import { AreaScene } from "../area/area-scene";
import { ioc } from "../context/ioc";
import { ctxEngine } from "../context/common";
import type { OptimisticGameState } from "../game-state/optimistic-game-state";
import { GameStateDebugInfo } from "../game-state/game-state-debug-info";
import {
  AreaDebugSettingsForm,
  type AreaDebugSettings,
} from "../area/area-debug-settings-form";
import { AreaUi } from "../area/area-ui";
import { GameDebugUi } from "./game-debug-ui";
import type { Application } from "@mp/graphics";
import { useSignal, useSignalEffect } from "@mp/state/react";
import { useObjectSignal } from "../use-object-signal";
import { GameAssetLoaderContext, type GameAssets } from "./game-asset-loader";
import type { AreaId } from "../area/area-id";

interface GameRendererProps {
  interactive: boolean;
  gameState: OptimisticGameState;
  additionalDebugUi?: JSX.Element;
  areaIdToLoadAssetsFor: AreaId;
}

/**
 * Composes all game graphics and UI into a single component that renders the actual game.
 */
export function GameRenderer({
  interactive,
  gameState,
  areaIdToLoadAssetsFor,
  additionalDebugUi,
}: GameRendererProps) {
  const useGameAssets = useContext(GameAssetLoaderContext);

  const assets = useGameAssets(areaIdToLoadAssetsFor);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const showDebugUi = useSignal(false);
  const appSignal = useGraphics(container);
  const optionsSignal = useObjectSignal({
    interactive,
    gameState,
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
      <AreaUi />
      {showDebugUi.value && (
        <GameDebugUi>
          {additionalDebugUi}
          <AreaDebugSettingsForm signal={areaDebugSettingsStorage} />
          <GameStateDebugInfo tiled={assets.area.tiled} />
        </GameDebugUi>
      )}
    </>
  );
}

function buildStage(
  app: Application,
  opt: {
    interactive: boolean;
    gameState: OptimisticGameState;
    assets: GameAssets;
    showDebugUi: Signal<boolean>;
  },
) {
  const engine = new Engine(app.canvas);
  const subscriptions = [
    engine.start(opt.interactive),
    ioc.register(ctxEngine, engine),
    engine.frameEmitter.subscribe(opt.gameState.frameCallback),
    engine.keyboard.on(
      "keydown",
      "F2",
      () => (opt.showDebugUi.value = !opt.showDebugUi.value),
    ),
  ];
  const areaScene = new AreaScene({
    area: opt.assets.area,
    debugSettings: () => areaDebugSettingsStorage.value,
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
