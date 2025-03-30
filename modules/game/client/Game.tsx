import { EngineContext, EngineProvider } from "@mp/engine";
import { Application } from "@mp/solid-pixi";
import type { JSX } from "solid-js";
import {
  useContext,
  createEffect,
  Switch,
  Match,
  Show,
  onCleanup,
} from "solid-js";
import { clsx } from "@mp/style";
import { LoadingSpinner } from "@mp/ui";
import * as styles from "./Game.css";
import { GameStateClientContext } from "./GameStateClient";
import { AreaDebugUI } from "./area/AreaDebugUI";
import { AreaScene } from "./area/AreaScene";
import { toggleSignal } from "./area/toggleSignal";
import { useAreaResource } from "./area/useAreaResource";

export function Game(props: {
  interactive: boolean;
  class?: string;
  style?: JSX.CSSProperties;
}) {
  const state = useContext(GameStateClientContext);
  const area = useAreaResource(state.areaId);
  const [debug, toggleDebug] = toggleSignal();

  createEffect(() => {
    if (state.readyState() === "open") {
      void state.join();
    }
  });

  return (
    <Switch>
      <Match
        when={
          state.readyState() !== "open" ||
          area.isLoading ||
          // AreaId would be null if the initial game state hasn't been received yet
          !state.areaId()
        }
      >
        {/** TODO replace with specialized loading screen for loading areas */}
        <LoadingSpinner />
      </Match>
      <Match when={area.data} keyed>
        {(data) => (
          <Application
            class={clsx(styles.container, props.class)}
            style={props.style}
          >
            {({ viewport }) => (
              <EngineProvider
                viewport={viewport}
                interactive={props.interactive}
              >
                {props.interactive && <Keybindings toggleDebug={toggleDebug} />}
                <AreaScene area={data}>
                  <Show when={debug()}>
                    <AreaDebugUI
                      area={data}
                      playerCoords={state.character()?.coords}
                      drawPathsForActors={state.actorsInArea()}
                    />
                  </Show>
                </AreaScene>
              </EngineProvider>
            )}
          </Application>
        )}
      </Match>
    </Switch>
  );
}

function Keybindings(props: { toggleDebug: () => void }) {
  const engine = useContext(EngineContext);
  createEffect(() => {
    onCleanup(engine.keyboard.on("keydown", "F2", props.toggleDebug));
  });
  return null;
}
