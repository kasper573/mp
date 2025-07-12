import { Engine } from "@mp/engine";
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { useStorage } from "@mp/state/react";
import { StorageAdapter } from "@mp/state";
import { useGraphics } from "@mp/graphics/react";
import { assert } from "@mp/std";
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
  const [showDebugUi, setShowDebugUi] = useState(false);
  const [areaDebugSettings, setAreaDebugSettings] = useStorage(
    areaDebugSettingsStorage,
  );

  useGraphics(
    container,
    {
      antialias: true,
      eventMode: "none",
      roundPixels: true,
      interactive,
      gameState,
      area,
    },
    (app, { interactive, gameState, area }) => {
      const engine = new Engine(assert(container));
      const subscriptions = [
        engine.start(interactive),
        ioc.register(ctxEngine, engine),
        engine.frameEmitter.subscribe(gameState.frameCallback),
        engine.keyboard.on("keydown", "F2", () =>
          setShowDebugUi((prev) => !prev),
        ),
      ];
      const areaScene = new AreaScene({
        area,
        spritesheets,
        debugSettings: () => areaDebugSettings,
      });
      app.stage.addChild(areaScene);
      return subscriptions;
    },
  );

  return (
    <>
      <div ref={setContainer} style={{ flex: 1 }} />
      <AreaUi />
      {showDebugUi && (
        <GameDebugUi>
          {additionalDebugUi}
          <AreaDebugSettingsForm
            value={areaDebugSettings}
            onChange={setAreaDebugSettings}
          />
          <GameStateDebugInfo tiled={area.tiled} />
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
