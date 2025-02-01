import {
  createEffect,
  Match,
  onCleanup,
  Show,
  Suspense,
  Switch,
  useContext,
} from "solid-js";
import { EngineContext, EngineProvider } from "@mp/engine";
import { AuthContext } from "@mp/auth/client";
import { Application } from "@mp/solid-pixi";
import { createSyncClient, SyncClientContext } from "../../integrations/sync";
import { useAreaResource } from "../../state/useAreaResource";
import { Dock } from "../../ui/Dock";
import { LoadingSpinner } from "../../ui/LoadingSpinner";
import { toggleSignal } from "../../state/toggleSignal";
import * as styles from "./GamePage.css";
import { AreaScene } from "./AreaScene";
import { WorldStateInspector } from "./WorldStateInspector";
import { AreaDebugUI } from "./AreaDebugUI";

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
      <pre>
        Data:{" "}
        {JSON.stringify(
          {
            data: area.latest?.id ?? null,
            loading: area.loading,
            error: (area.error as unknown) ?? null,
          },
          null,
          2,
        )}
      </pre>
      <Switch>
        <Match when={!auth.isSignedIn()}>
          <Dock position="center">Sign in to play</Dock>
        </Match>
        <Match when={world.readyState() !== "open" || area.isLoading}>
          {/** TODO replace with specialized loading screen for loading areas */}
          <LoadingSpinner debugId="GamePage" />
        </Match>
        <Match when={area.data} keyed>
          {(data) => (
            <Application class={styles.container}>
              {({ viewport }) => (
                <EngineProvider viewport={viewport}>
                  <EngineBindings toggleDebug={toggleDebug} />
                  <Suspense fallback="AreaScene loading...">
                    <AreaScene area={data}>
                      <Show when={debug()}>
                        <AreaDebugUI
                          area={data}
                          pathsToDraw={world
                            .actorsInArea()
                            .flatMap((actor) =>
                              actor.path ? [actor.path] : [],
                            )}
                        />
                        <WorldStateInspector worldState={world.worldState()} />
                      </Show>
                    </AreaScene>
                  </Suspense>
                </EngineProvider>
              )}
            </Application>
          )}
        </Match>
      </Switch>
    </SyncClientContext.Provider>
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
