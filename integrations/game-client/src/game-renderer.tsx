import type { AreaId } from "@mp/db/types";
import { Engine } from "@mp/engine";
import { ctxActorSpritesheetLookup } from "@mp/game-shared";
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
import { AreaScene, ctxAreaSpritesheets } from "./area-scene";
import { AreaUi } from "./area-ui";
import { ctxEngine, ioc } from "./context";
import { GameAssetLoaderContext, type GameAssets } from "./game-asset-loader";
import { GameDebugUi } from "./game-debug-ui";
import { GameStateDebugInfo } from "./game-state-debug-info";
import type { OptimisticGameState } from "./optimistic-game-state";
import { useObjectSignal } from "./use-object-signal";

interface GameRendererProps {
  interactive: boolean;
  gameState: OptimisticGameState;
  additionalDebugUi?: JSX.Element;
  areaIdToLoadAssetsFor: AreaId;
  enableUi?: boolean;
}

/**
 * Composes all game graphics and UI into a single component that renders the actual game.
 */
export function GameRenderer({
  interactive,
  gameState,
  areaIdToLoadAssetsFor,
  additionalDebugUi,
  enableUi = true,
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
      {enableUi && (
        <>
          <AreaUi />
          {showDebugUi.value && (
            <GameDebugUi>
              {additionalDebugUi}
              <AreaDebugSettingsForm signal={areaDebugSettingsStorage} />
              <GameStateDebugInfo tiled={assets.area.tiled} />
            </GameDebugUi>
          )}
        </>
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
    ioc.register(ctxAreaSpritesheets, opt.assets.areaSpritesheets),
    ioc.register(ctxActorSpritesheetLookup, opt.assets.actorSpritesheets),
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
