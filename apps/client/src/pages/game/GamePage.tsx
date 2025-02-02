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
import { createSyncClient, SyncClientContext } from "../../integrations/sync";
import { useAreaResource } from "../../state/useAreaResource";
import { LoadingSpinner } from "../../ui/LoadingSpinner";
import { toggleSignal } from "../../state/toggleSignal";
import * as styles from "./GamePage.css";
import { AreaDebugUI } from "./AreaDebugUI";
import { AreaScene } from "./AreaScene";

export default function GamePage() {
  const auth = useContext(AuthContext);
  const world = createSyncClient(auth);
  const area = useAreaResource(world.areaId);
  const [debug, toggleDebug] = toggleSignal();

  createEffect(() => {
    if (world.readyState() === "open") {
      void world.join();
    }
  });

  return (
    <SyncClientContext.Provider value={world}>
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
            <Application class={styles.container}>
              {({ viewport }) => (
                <EngineProvider viewport={viewport}>
                  <Keybindings toggleDebug={toggleDebug} />
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
    </SyncClientContext.Provider>
  );
}

function Keybindings(props: { toggleDebug: () => void }) {
  const engine = useContext(EngineContext);
  createEffect(() => {
    onCleanup(engine.keyboard.on("keydown", "F2", props.toggleDebug));
  });
  return null;
}
