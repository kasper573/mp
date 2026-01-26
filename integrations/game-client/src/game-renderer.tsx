import type { AreaId } from "@mp/game-shared";
import { Engine } from "@mp/engine";
import type { Application } from "@mp/graphics";
import { useGraphics } from "@mp/graphics/solid";
import type { Signal } from "@mp/state";
import { StorageSignal, untracked, signal } from "@mp/state";
import type { JSX } from "solid-js";
import {
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  Suspense,
  Show,
  useContext,
} from "solid-js";
import type { ActorTextureLookup } from "./actor-texture-lookup";
import {
  AreaDebugSettingsForm,
  type AreaDebugSettings,
} from "./area-debug-settings-form";
import { AreaScene } from "./area-scene";
import { AreaUi } from "./area-ui";
import { GameStateClientContext, GameAssetLoaderContext } from "./context";
import type { AreaAssets } from "./game-asset-loader";
import { GameDebugUi } from "./game-debug-ui";
import type { GameStateClient } from "./game-state-client";
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
  const assetLoader = useContext(GameAssetLoaderContext);
  const [container, setContainer] = createSignal<HTMLDivElement | null>(null);
  const showDebugUi = signal(false);
  const appSignal = useGraphics(container);

  // Call hooks once in the component body to create the TanStack Query stores
  // The hooks return objects with getters for reactive data access
  const areaAssets = assetLoader.useAreaAssets(props.areaIdToLoadAssetsFor);
  const actorTexturesAccessor = assetLoader.useActorTextures();

  // Create a memo that reads all the async data and produces a ready state
  // Reading through getters inside createMemo ensures SolidJS tracks the TanStack Query stores
  const buildOptions = createMemo((): BuildStageOptions | undefined => {
    const app = appSignal.get();
    // Access TanStack Query store data through getters for reactive tracking
    const resource = areaAssets.resource;
    const spritesheets = areaAssets.spritesheets;
    const actorTextures = actorTexturesAccessor.data;

    if (!app || !resource || !spritesheets || !actorTextures) {
      return undefined;
    }

    return {
      interactive: props.interactive,
      gameStateClient: props.gameStateClient,
      areaAssets: { resource, spritesheets },
      actorTextures,
      showDebugUi,
    };
  });

  // Effect that builds the stage when all data is ready
  createEffect(() => {
    const options = buildOptions();
    if (!options) {
      return;
    }

    const app = appSignal.get();
    if (!app) {
      return;
    }

    const cleanup = untracked(() => buildStage(app, options));
    if (cleanup) {
      onCleanup(cleanup);
    }
  });

  const enableUi = () => props.enableUi ?? true;

  return (
    <>
      <div ref={setContainer} style={{ flex: 1 }} />
      <Show when={enableUi()}>
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
  areaAssets: AreaAssets;
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
      opt.showDebugUi.set(!opt.showDebugUi.get()),
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
