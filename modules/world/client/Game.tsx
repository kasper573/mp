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
import { AreaDebugUI } from "./AreaDebugUI";
import { AreaScene } from "./AreaScene";
import * as styles from "./Game.css";
import { WorldSyncClientContext } from "./WorldSyncClient";
import { toggleSignal } from "./toggleSignal";
import { useAreaResource } from "./useAreaResource";

export function Game(props: {
  interactive: boolean;
  class?: string;
  style?: JSX.CSSProperties;
}) {
  const world = useContext(WorldSyncClientContext);
  const area = useAreaResource(world.areaId);
  const [debug, toggleDebug] = toggleSignal();

  createEffect(() => {
    if (world.readyState() === "open") {
      void world.join();
    }
  });

  return (
    <Switch>
      <Match
        when={
          world.readyState() !== "open" ||
          area.isLoading ||
          // AreaId would be null if the initial world state hasn't been received yet
          !world.areaId()
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
                      drawPathsForActors={world.actorsInArea()}
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
