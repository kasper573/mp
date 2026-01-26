import type { AreaId } from "@mp/game-shared";
import { Engine } from "@mp/engine";
import type { Application } from "@mp/graphics";
import { useGraphics } from "@mp/graphics/solid";
import type { Signal } from "@mp/state";
import { StorageSignal, untracked } from "@mp/state";
import { useSignal, useSignalEffect } from "@mp/state/solid";
import { Suspense, Show, type JSX, createSignal } from "solid-js";
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
export function GameRenderer(props: GameRendererProps) {
  const enableUi = props.enableUi ?? true;
  const areaAssets = useAreaAssets(props.areaIdToLoadAssetsFor);
  const actorTextures = useActorTextures();
  const [container, setContainer] = createSignal<HTMLDivElement | null>(null);
  const showDebugUi = useSignal(false);
  const appSignal = useGraphics(container);
  const optionsSignal = useObjectSignal(() => ({
    interactive: props.interactive,
    gameStateClient: props.gameStateClient,
    areaAssets,
    actorTextures,
    showDebugUi,
  }));

  useSignalEffect(() => {
    const app = appSignal.get();
    const options = optionsSignal.get();
    const resource = options.areaAssets?.resource;
    const spritesheets = options.areaAssets?.spritesheets;
    const textures = options.actorTextures;
    // Only build stage when all assets are loaded
    if (app && resource && spritesheets && textures) {
      return untracked(() =>
        buildStage(app, {
          interactive: options.interactive,
          gameStateClient: options.gameStateClient,
          areaAssets: { resource, spritesheets },
          actorTextures: textures,
          showDebugUi: options.showDebugUi,
        }),
      );
    }
  });

  return (
    <>
      <div ref={setContainer} style={{ flex: "1" }} />
      <Show when={enableUi}>
        <GameStateClientContext.Provider value={props.gameStateClient}>
          <Suspense fallback={<UILoadingFallback />}>
            <AreaUi />
            <Show when={showDebugUi.get()}>
              <GameDebugUi>
                {props.additionalDebugUi}
                <AreaDebugSettingsForm signal={areaDebugSettingsStorage} />
              </GameDebugUi>
            </Show>
          </Suspense>
        </GameStateClientContext.Provider>
      </Show>
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

interface BuildStageOptions {
  interactive: boolean;
  gameStateClient: GameStateClient;
  areaAssets: {
    resource: NonNullable<AreaAssets["resource"]>;
    spritesheets: NonNullable<AreaAssets["spritesheets"]>;
  };
  actorTextures: ActorTextureLookup;
  showDebugUi: Signal<boolean>;
}

function buildStage(app: Application, opt: BuildStageOptions) {
  const engine = new Engine(app.canvas);

  function emitTickToGameState() {
    opt.gameStateClient.gameState.frameCallback(
      TimeSpan.fromMilliseconds(app.ticker.deltaMS),
    );
  }

  app.ticker.add(emitTickToGameState);
  const subscriptions = [
    engine.start(opt.interactive),
    engine.keyboard.on("keydown", "F2", () =>
      opt.showDebugUi.write(!opt.showDebugUi.get()),
    ),
  ];
  const areaScene = new AreaScene({
    engine,
    debugSettings: () => areaDebugSettingsStorage.get(),
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
