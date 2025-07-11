import { Engine } from "@mp/engine";
import type { JSX } from "react";
import { useState } from "react";
import { useStorage } from "@mp/state/react";
import { StorageAdapter } from "@mp/state";
import { type AreaSceneOptions, AreaScene } from "../area/area-scene";
import { ioc } from "../context/ioc";
import { ctxEngine } from "../context/common";
import type { OptimisticGameState } from "../game-state/optimistic-game-state";
import { useGraphics } from "../use-graphics";
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
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [showDebugUi, setShowDebugUi] = useState(false);
  const [areaDebugSettings, setAreaDebugSettings] = useStorage(
    areaDebugSettingsStorage,
  );

  useGraphics(
    {
      canvas,
      antialias: true,
      eventMode: "none",
      roundPixels: true,
    },
    (app, canvas) => {
      const engine = new Engine(canvas);
      const subscriptions = [
        engine.start(props.interactive),
        ioc.register(ctxEngine, engine),
        engine.frameEmitter.subscribe(props.gameState.frameCallback),
        engine.keyboard.on("keydown", "F2", () =>
          setShowDebugUi((prev) => !prev),
        ),
      ];
      const areaScene = new AreaScene({
        ...props.areaSceneOptions,
        debugSettings: () => areaDebugSettings,
      });
      app.stage.addChild(areaScene);
      return subscriptions;
    },
  );

  return (
    <>
      <canvas ref={setCanvas} />
      <AreaUi />
      {showDebugUi && (
        <GameDebugUi>
          {props.additionalDebugUi}
          <AreaDebugSettingsForm
            value={areaDebugSettings}
            onChange={setAreaDebugSettings}
          />
          <GameStateDebugInfo tiled={props.areaSceneOptions.area.tiled} />
        </GameDebugUi>
      )}
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
