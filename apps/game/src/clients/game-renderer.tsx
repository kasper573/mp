import { Engine } from "@mp/engine";
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import type { Signal } from "@mp/state";
import { StorageSignal } from "@mp/state";
import { useGraphics } from "@mp/graphics/react";
import { type AreaSceneOptions, AreaScene } from "../area/area-scene";
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
import type { AreaResource } from "../area/area-resource";
import { useSignal } from "@mp/state/react";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";

interface GameRendererProps {
  interactive: boolean;
  gameState: OptimisticGameState;
  additionalDebugUi?: JSX.Element;
  areaSceneOptions: Omit<AreaSceneOptions, "debugSettings">;
}

/**
 * Composes all game graphics and UI into a single component that renders the actual game.
 */
export function GameRenderer({
  interactive,
  areaSceneOptions: { area, spritesheets },
  gameState,
  additionalDebugUi,
}: GameRendererProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const showDebugUi = useSignal(false);

  useGraphics(
    container,
    {
      antialias: true,
      eventMode: "none",
      roundPixels: true,
      interactive,
      gameState,
      spritesheets,
      showDebugUi,
      area,
    },
    buildStage,
  );

  return (
    <>
      <div ref={setContainer} style={{ flex: 1 }} />
      <AreaUi />
      {showDebugUi.value && (
        <GameDebugUi>
          {additionalDebugUi}
          <AreaDebugSettingsForm signal={areaDebugSettingsStorage} />
          <GameStateDebugInfo tiled={area.tiled} />
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
    area: AreaResource;
    spritesheets: TiledSpritesheetRecord;
    showDebugUi: Signal<boolean>;
  },
  container: HTMLDivElement,
) {
  const engine = new Engine(container);
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
    area: opt.area,
    spritesheets: opt.spritesheets,
    debugSettings: () => areaDebugSettingsStorage.value,
  });
  app.stage.addChild(areaScene);
  return subscriptions;
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
