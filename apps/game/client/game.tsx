import { EngineContext, EngineProvider } from "@mp/engine";
import { Application } from "@mp/solid-pixi";
import type { JSX, ParentProps } from "solid-js";
import {
  useContext,
  createEffect,
  Switch,
  Match,
  Suspense,
  createSignal,
  createMemo,
} from "solid-js";
import { clsx } from "@mp/style";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import { AuthContext } from "@mp/auth/client";
import { loadTiledMapSpritesheets } from "@mp/tiled-renderer";
import { skipToken, useQuery } from "@mp/rpc/solid";
import * as styles from "./game.css";
import { GameStateClientContext, useGameActions } from "./game-state-client";
import { AreaScene } from "./area/area-scene";
import { useAreaResource } from "./area/use-area-resource";
import { loadActorSpritesheets } from "./actor/actor-spritesheet-lookup";
import { GameDebugUi } from "./debug/game-debug-ui";
import type { GameDebugUiState } from "./debug/game-debug-ui-state";
import { GameDebugUiContext } from "./debug/game-debug-ui-state";
import { GameStateDebugInfo } from "./debug/game-state-debug-info";
import { useRpc } from "./use-rpc";
import { ActorSpritesheetContext } from "./actor/actor-spritesheet-lookup";

export function Game(
  props: ParentProps<{ class?: string; style?: JSX.CSSProperties }>,
) {
  const rpc = useRpc();
  const [portalContainer, setPortalContainer] = createSignal<HTMLElement>();
  const [isDebugUiEnabled, setDebugUiEnabled] = createSignal(false);
  const state = useContext(GameStateClientContext);
  const auth = useContext(AuthContext);
  const actions = useGameActions();

  const area = useAreaResource(state.areaId);

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

  createEffect(() => {
    const user = auth.identity();
    if (state.readyState() === WebSocket.OPEN && user) {
      void actions.join(user.token);
    }
  });

  return (
    <Switch>
      <Match when={assets()} keyed>
        {({ area, spritesheets, actorSpritesheets }) => (
          <Suspense
            fallback={<LoadingSpinner>Loading renderer</LoadingSpinner>}
          >
            <Application
              class={clsx(styles.container, props.class)}
              style={props.style}
            >
              {({ viewport }) => (
                <ActorSpritesheetContext.Provider value={actorSpritesheets}>
                  <EngineProvider viewport={viewport}>
                    <GameDebugUiContext.Provider value={debugUiState}>
                      <Suspense
                        fallback={<LoadingSpinner>Loading area</LoadingSpinner>}
                      >
                        <AreaScene area={area} spritesheets={spritesheets} />
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

      <Match when={state.readyState() !== WebSocket.OPEN}>
        <LoadingSpinner>Connecting to game server</LoadingSpinner>
      </Match>
      <Match when={!state.areaId()}>
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
  );
}

// TODO refactor. This is a hack to workaround the problematic Application/EngineProvider pattern.
// It would be better if we could instantiate the engine higher up the tree so we can do this without a component.
function GameStateClientAnimations() {
  const state = useContext(GameStateClientContext);
  const engine = useContext(EngineContext);
  engine.addFrameCallback(state.frameCallback);
  return null;
}
