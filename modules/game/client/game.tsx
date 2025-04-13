import { EngineProvider } from "@mp/engine";
import { Application } from "@mp/solid-pixi";
import type { JSX } from "solid-js";
import {
  useContext,
  createEffect,
  Switch,
  Match,
  Suspense,
  ErrorBoundary,
} from "solid-js";
import { clsx } from "@mp/style";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import * as styles from "./game.css";
import { GameStateClientContext, useGameActions } from "./game-state-client";
import { AreaScene } from "./area/area-scene";
import { useAreaResource } from "./area/use-area-resource";

export function Game(props: { class?: string; style?: JSX.CSSProperties }) {
  const state = useContext(GameStateClientContext);
  const actions = useGameActions();
  const area = useAreaResource(state.areaId);

  createEffect(() => {
    if (state.readyState() === "open") {
      void actions.join();
    }
  });

  return (
    <Switch>
      <Match when={area.data} keyed>
        {(data) => (
          <Suspense
            fallback={<LoadingSpinner>Loading renderer</LoadingSpinner>}
          >
            <ErrorBoundary
              fallback={(error, reset) => (
                <ErrorFallback
                  error={new Error("Renderer error", { cause: error })}
                  reset={reset}
                />
              )}
            >
              <Application
                class={clsx(styles.container, props.class)}
                style={props.style}
              >
                {({ viewport }) => (
                  <EngineProvider viewport={viewport}>
                    <AreaScene area={data} />
                  </EngineProvider>
                )}
              </Application>
            </ErrorBoundary>
          </Suspense>
        )}
      </Match>
      <Match when={state.readyState() !== "open"}>
        <LoadingSpinner>Connecting to game server</LoadingSpinner>
      </Match>
      <Match when={!state.areaId()}>
        <LoadingSpinner>Waiting for game state</LoadingSpinner>
      </Match>
      <Match when={area.isLoading}>
        <LoadingSpinner>Loading area</LoadingSpinner>
      </Match>
    </Switch>
  );
}
