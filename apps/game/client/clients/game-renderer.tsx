import { Engine } from "@mp/engine";
import { Application } from "pixi.js";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { assert } from "@mp/std";
import { useStorage } from "@mp/state/solid";
import { StorageAdapter } from "@mp/state";
import { type AreaSceneOptions, AreaScene } from "../area/area-scene";
import { ioc } from "../context";
import type { GameDebugUiState } from "../debug/game-debug-ui-state";
import { ctxEngine } from "../engine-context";
import type { OptimisticGameState } from "../game-state/optimistic-game-state";
import { usePixiApp } from "../pixi/use-pixi-app";
import { AreaUi } from "../area/area-ui";
import { GameDebugUi } from "../debug/game-debug-ui";
import { GameStateDebugInfo } from "../debug/game-state-debug-info";
import type { AreaDebugSettings } from "../area/area-debug-settings-form";

interface GameRendererProps {
  interactive: boolean;
  gameState: OptimisticGameState;
  debugUiState: GameDebugUiState;
  areaSceneOptions: Omit<AreaSceneOptions, "debugSettings">;
}

export function GameRenderer(props: GameRendererProps) {
  const [getCanvas, setCanvas] = createSignal<HTMLCanvasElement>();

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

      const { setEnabled } = props.debugUiState;
      const engine = new Engine(canvas);

      onCleanup(engine.start(props.interactive));
      onCleanup(ioc.register(ctxEngine, engine));
      onCleanup(
        engine.keyboard.on("keydown", "F2", () => setEnabled((prev) => !prev)),
      );
      onCleanup(engine.frameEmitter.subscribe(props.gameState.frameCallback));

      const areaScene = new AreaScene({
        ...props.areaSceneOptions,
        debugSettings: areaDebugSettings,
      });
      app.stage.addChild(areaScene);

      await app.init({
        antialias: true,
        eventMode: "none",
        roundPixels: true,
        resizeTo: assert(canvas.parentElement),
        canvas,
      });

      return app;
    });
  });

  return (
    <>
      <canvas ref={setCanvas} />
      <AreaUi
        debugFormProps={{
          value: areaDebugSettings(),
          onChange: setAreaDebugSettings,
        }}
      />
      <GameDebugUi>
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
