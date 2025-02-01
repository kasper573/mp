import {
  createEffect,
  Match,
  onCleanup,
  Switch,
  useContext,
  Show,
} from "solid-js";
import { EngineContext, EngineProvider } from "@mp/engine";
import { AuthContext } from "@mp/auth/client";
import { Application } from "@mp/solid-pixi";
import type { AreaResource } from "@mp/data";
import { createSyncClient, SyncClientContext } from "../../integrations/sync";
import { useAreaResource } from "../../state/useAreaResource";
import { LoadingSpinner } from "../../ui/LoadingSpinner";
import { toggleSignal } from "../../state/toggleSignal";
import * as styles from "./GamePage.css";
import { AreaDebugUI } from "./AreaDebugUI";
import { AreaScene } from "./AreaScene";
import { WorldStateInspector } from "./WorldStateInspector";

export default function GamePage() {
  const auth = useContext(AuthContext);
  const world = createSyncClient(auth);
  const area = useAreaResource(world.areaId);

  createEffect(() => {
    if (world.readyState() === "open") {
      void world.join();
    }
  });

  return (
    <SyncClientContext.Provider value={world}>
      <Switch>
        <Match when={world.readyState() !== "open" || area.isLoading}>
          {/** TODO replace with specialized loading screen for loading areas */}
          <LoadingSpinner debugId="GamePage" />
        </Match>
        <Match when={area.data} keyed>
          {(data) => <Game area={data} />}
        </Match>
      </Switch>
    </SyncClientContext.Provider>
  );
}

function Game(props: { area: AreaResource }) {
  const [debug, toggleDebug] = toggleSignal();
  const world = useContext(SyncClientContext);
  return (
    <Application class={styles.container}>
      {({ viewport }) => (
        <EngineProvider viewport={viewport}>
          <EngineBindings toggleDebug={toggleDebug} />

          <AreaScene area={props.area}>
            <Show when={debug()}>
              <AreaDebugUI
                area={props.area}
                pathsToDraw={world
                  .actorsInArea()
                  .flatMap((actor) => (actor.path ? [actor.path] : []))}
              />
              <WorldStateInspector worldState={world.worldState()} />
            </Show>
          </AreaScene>
        </EngineProvider>
      )}
    </Application>
  );
}

// TODO remove this component, this is an anti pattern. Better to initialize an engine instance higher up the tree instead.
function EngineBindings(props: { toggleDebug: () => void }) {
  const engine = useContext(EngineContext);
  createEffect(() => {
    onCleanup(engine.keyboard.on("keydown", "F2", props.toggleDebug));
  });
  return null;
}
