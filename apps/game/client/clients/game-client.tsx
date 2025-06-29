import { EngineContext, EngineProvider } from "@mp/engine";
import { Application } from "@mp/solid-pixi";
import type { JSX, ParentProps } from "solid-js";
import {
  useContext,
  Switch,
  Match,
  Suspense,
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
} from "solid-js";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";
import { skipToken, useQuery } from "@mp/rpc/solid";
import type { GameStateClient } from "../game-state/game-state-client";
import {
  deriveReactiveGameState,
  GameStateClientContext,
  ReactiveGameStateContext,
} from "../game-state/game-state-client";
import { AreaScene } from "../area/area-scene";
import { useAreaResource } from "../area/use-area-resource";
import { loadActorSpritesheets } from "../actor/actor-spritesheet-lookup";
import { GameDebugUi } from "../debug/game-debug-ui";
import type { GameDebugUiState } from "../debug/game-debug-ui-state";
import { GameDebugUiContext } from "../debug/game-debug-ui-state";
import { GameStateDebugInfo } from "../debug/game-state-debug-info";
import { useRpc } from "../use-rpc";
import { ActorSpritesheetContext } from "../actor/actor-spritesheet-lookup";

export type GameClientProps = ParentProps<{
  gameState: GameStateClient;
  interactive?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
}>;

export function GameClient(props: GameClientProps) {
  const rpc = useRpc();
  const [portalContainer, setPortalContainer] = createSignal<HTMLElement>();
  const [isDebugUiEnabled, setDebugUiEnabled] = createSignal(false);
  const interactive = () => props.interactive ?? true;

  // eslint-disable-next-line solid/reactivity
  const reactiveGameState = deriveReactiveGameState(() => props.gameState);

  const area = useAreaResource(() => reactiveGameState.areaId());

  const areaSpritesheets = useQuery(() => ({
    queryKey: ["areaSpritesheets", area.data?.id],
    staleTime: Infinity,
    queryFn: area.data
      ? () => loadTiledMapSpritesheets(area.data.tiled.map)
      : skipToken,
  }));

  const actorSpritesheets = rpc.area.actorSpritesheetUrls.useQuery(() => ({
    input: void 0,
    map: loadActorSpritesheets,
    staleTime: Infinity,
  }));

  const assets = createMemo(() => {
    if (area.data && areaSpritesheets.data && actorSpritesheets.data) {
      return {
        area: area.data,
        spritesheets: areaSpritesheets.data,
        actorSpritesheets: actorSpritesheets.data,
      };
    }
  });

  const debugUiState: GameDebugUiState = {
    portalContainer,
    setPortalContainer,
    enabled: isDebugUiEnabled,
    setEnabled: setDebugUiEnabled,
  };

  const gameStateAccessor = () => props.gameState;
  const reactiveGameStateAccessor = () => reactiveGameState;

  return (
    <GameStateClientContext.Provider value={gameStateAccessor}>
      <ReactiveGameStateContext.Provider value={reactiveGameStateAccessor}>
        <Switch>
          <Match when={assets()} keyed>
            {({ area, spritesheets, actorSpritesheets }) => (
              <Suspense
                fallback={<LoadingSpinner>Loading renderer</LoadingSpinner>}
              >
                <Application class={props.class} style={props.style}>
                  {({ viewport }) => (
                    <ActorSpritesheetContext.Provider value={actorSpritesheets}>
                      <EngineProvider
                        interactive={interactive()}
                        viewport={viewport}
                      >
                        <GameDebugUiContext.Provider value={debugUiState}>
                          <Suspense
                            fallback={
                              <LoadingSpinner>Loading area</LoadingSpinner>
                            }
                          >
                            <AreaScene
                              area={area}
                              spritesheets={spritesheets}
                            />
                          </Suspense>
                          <GameStateClientAnimations />
                          {props.children}
                          <GameDebugUi>
                            <GameStateDebugInfo tiled={area.tiled} />
                          </GameDebugUi>
                        </GameDebugUiContext.Provider>
                      </EngineProvider>
                    </ActorSpritesheetContext.Provider>
                  )}
                </Application>
              </Suspense>
            )}
          </Match>

          <Match when={props.gameState.readyState.get() !== WebSocket.OPEN}>
            <LoadingSpinner>Connecting to game server</LoadingSpinner>
          </Match>
          <Match when={!reactiveGameState.areaId()}>
            <LoadingSpinner>Waiting for game state</LoadingSpinner>
          </Match>
          <Match when={area.isLoading}>
            <LoadingSpinner>Loading area</LoadingSpinner>
          </Match>
          <Match when={!area.data}>
            <ErrorFallback
              error="Could not load area data"
              reset={() => void area.refetch()}
            />
          </Match>
        </Switch>
      </ReactiveGameStateContext.Provider>
    </GameStateClientContext.Provider>
  );
}

// TODO refactor. This is a hack to workaround the problematic Application/EngineProvider pattern.
// It would be better if we could instantiate the engine higher up the tree so we can do this without a component.
function GameStateClientAnimations() {
  const client = useContext(GameStateClientContext);
  const engine = useContext(EngineContext);
  createEffect(() => {
    onCleanup(engine.addFrameCallback(client().gameState.frameCallback));
  });
  return null;
}
