import { Engine } from "@mp/engine";
import { Application } from "pixi.js";
import type { JSX } from "solid-js";
import { onCleanup, createEffect, splitProps } from "solid-js";
import { type AreaSceneOptions, AreaScene } from "../area/area-scene";
import { ioc } from "../context";
import type { GameDebugUiState } from "../debug/game-debug-ui-state";
import { ctxEngine } from "../engine-context";
import type { OptimisticGameState } from "../game-state/optimistic-game-state";
import { SolidPixi } from "../pixi/solid-pixi";

interface GamePixiApplicationProps extends JSX.HTMLAttributes<HTMLDivElement> {
  interactive: boolean;
  gameState: OptimisticGameState;
  debugUiState: GameDebugUiState;
  areaSceneOptions: AreaSceneOptions;
}

export function GamePixiApplication(inputProps: GamePixiApplicationProps) {
  const [props, divProps] = splitProps(inputProps, [
    "interactive",
    "gameState",
    "debugUiState",
    "areaSceneOptions",
  ]);

  const canvas = document.createElement("canvas");
  const engine = new Engine(canvas);

  async function createApp() {
    const app = new Application();
    await app.init({
      antialias: true,
      eventMode: "none",
      roundPixels: true,
      canvas,
    });
    const areaScene = new AreaScene(props.areaSceneOptions);
    app.stage.addChild(areaScene);
    return app;
  }

  onCleanup(ioc.register(ctxEngine, engine));

  createEffect(() => onCleanup(engine.start(props.interactive)));

  createEffect(() => {
    onCleanup(engine.frameEmitter.subscribe(props.gameState.frameCallback));
  });

  createEffect(() => {
    const { setEnabled } = props.debugUiState;
    onCleanup(
      engine.keyboard.on("keydown", "F2", () => setEnabled((prev) => !prev)),
    );
  });

  return <SolidPixi createApp={createApp} {...divProps} />;
}
