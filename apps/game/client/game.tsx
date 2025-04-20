import { EngineContext, EngineProvider } from "@mp/engine";
import { Application } from "@mp/solid-pixi";
import type { JSX } from "solid-js";
import { useContext, createEffect, Switch, Match, Suspense } from "solid-js";
import { clsx } from "@mp/style";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import { AuthContext } from "@mp/auth/client";
import * as styles from "./game.css";
import { GameStateClientContext, useGameActions } from "./game-state-client";
import { AreaScene } from "./area/area-scene";
import { useAreaResource } from "./area/use-area-resource";

export function Game(props: { class?: string; style?: JSX.CSSProperties }) {
  const state = useContext(GameStateClientContext);
  const auth = useContext(AuthContext);
  const actions = useGameActions();
  const area = useAreaResource(state.areaId);

  createEffect(() => {
    const user = auth.identity();
    if (state.readyState() === WebSocket.OPEN && user) {
      void actions.join(user.token);
    }
  });

  return (
    <Switch>
      <Match when={area.data} keyed>
        {(data) => (
          <Suspense
            fallback={<LoadingSpinner>Loading renderer</LoadingSpinner>}
          >
            <Application
              class={clsx(styles.container, props.class)}
              style={props.style}
            >
              {({ viewport }) => (
                <EngineProvider viewport={viewport}>
                  <AreaScene area={data} />
                  <GameStateClientAnimations />
                </EngineProvider>
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
