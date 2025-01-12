import { createEffect, Match, Switch, useContext } from "solid-js";
import { EngineProvider } from "@mp/engine";
import { AuthContext } from "@mp/auth-client";
import { createQuery, skipToken } from "@tanstack/solid-query";
import { Application } from "@mp/solid-pixi";
import { createWorldClient, WorldClientContext } from "../../clients/world";
import { loadAreaResource } from "../../state/loadAreaResource";
import { Dock } from "../../ui/Dock";
import { LoadingSpinner } from "../../ui/LoadingSpinner";
import * as styles from "./GamePage.css";
import { AreaScene } from "./AreaScene";

export default function GamePage() {
  const auth = useContext(AuthContext);
  const world = createWorldClient(auth);
  const area = createQuery(() => {
    const id = world.areaId();
    return {
      queryKey: ["area", id],
      queryFn: id ? () => loadAreaResource(id) : skipToken,
      refetchOnWindowFocus: false,
    };
  });

  createEffect(() => {
    if (world.readyState() === "open") {
      void world.join();
    }
  });

  return (
    <WorldClientContext.Provider value={world}>
      <Switch>
        <Match when={!auth.isSignedIn()}>
          <Dock position="center">Sign in to play</Dock>
        </Match>
        <Match when={world.readyState() !== "open" || area.isPending}>
          {/** TODO replace with specialized loading screen for loading areas */}
          <LoadingSpinner />
        </Match>
        <Match when={area.data} keyed>
          {(data) => (
            <Application class={styles.container}>
              {({ viewport }) => (
                <EngineProvider viewport={viewport}>
                  <AreaScene area={data} />
                </EngineProvider>
              )}
            </Application>
          )}
        </Match>
      </Switch>
    </WorldClientContext.Provider>
  );
}
