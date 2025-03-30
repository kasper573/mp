import { EngineProvider } from "@mp/engine";
import { Application } from "@mp/solid-pixi";
import type { JSX } from "solid-js";
import { useContext, createEffect, Switch, Match } from "solid-js";
import { clsx } from "@mp/style";
import { LoadingSpinner } from "@mp/ui";
import * as styles from "./Game.css";
import { GameStateClientContext } from "./GameStateClient";
import { AreaScene } from "./area/AreaScene";
import { useAreaResource } from "./area/useAreaResource";

export function Game(props: { class?: string; style?: JSX.CSSProperties }) {
  const state = useContext(GameStateClientContext);
  const area = useAreaResource(state.areaId);

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
              <EngineProvider viewport={viewport}>
                <AreaScene area={data} />
              </EngineProvider>
            )}
          </Application>
        )}
      </Match>
    </Switch>
  );
}
