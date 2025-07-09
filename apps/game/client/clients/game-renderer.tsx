import { Engine } from "@mp/engine";
import { Application } from "pixi.js";
import type { JSX } from "solid-js";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { useStorage } from "@mp/state/solid";
import { StorageAdapter } from "@mp/state";
import { type AreaSceneOptions, AreaScene } from "../area/area-scene";
import { ioc } from "../context";
import { ctxEngine } from "../engine-context";
import type { OptimisticGameState } from "../game-state/optimistic-game-state";
import { usePixiApp } from "../pixi/use-pixi-app";
import { GameStateDebugInfo } from "../game-state/game-state-debug-info";
import {
  AreaDebugSettingsForm,
  type AreaDebugSettings,
} from "../area/area-debug-settings-form";
import { AreaUi } from "../area/area-ui";
import { GameDebugUi } from "./game-debug-ui";

interface GameRendererProps {
  interactive: boolean;
  gameState: OptimisticGameState;
  additionalDebugUi?: JSX.Element;
  areaSceneOptions: Omit<AreaSceneOptions, "debugSettings">;
}

/**
 * Composes all game graphics and UI into a single component that renders the actual game.
 */
export function GameRenderer(props: GameRendererProps) {
  const [getCanvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [showDebugUi, setShowDebugUi] = createSignal(false);
  const [areaDebugSettings, setAreaDebugSettings] = useStorage(
    areaDebugSettingsStorage,
  );

  createEffect(() => {
    const canvas = getCanvas();
    if (!canvas) {
      return;
    }

    usePixiApp(async () => {
      const app = new Application();
      const engine = new Engine(canvas);

      onCleanup(engine.start(props.interactive));
      onCleanup(ioc.register(ctxEngine, engine));
      onCleanup(engine.frameEmitter.subscribe(props.gameState.frameCallback));
      onCleanup(
        engine.keyboard.on("keydown", "F2", () =>
          setShowDebugUi((prev) => !prev),
        ),
      );

      const areaScene = new AreaScene({
        ...props.areaSceneOptions,
        debugSettings: areaDebugSettings,
      });
      app.stage.addChild(areaScene);

      await app.init({
        antialias: true,
        eventMode: "none",
        roundPixels: true,
        canvas,
      });

      return app;
    });
  });

  return (
    <>
      <canvas ref={setCanvas} />
      <AreaUi />
      <GameDebugUi enabled={showDebugUi()}>
        <AreaDebugSettingsForm
          value={areaDebugSettings()}
          onChange={setAreaDebugSettings}
        />
        <GameStateDebugInfo tiled={props.areaSceneOptions.area.tiled} />
      </GameDebugUi>
    </>
  );
}

const areaDebugSettingsStorage = new StorageAdapter<AreaDebugSettings>(
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
