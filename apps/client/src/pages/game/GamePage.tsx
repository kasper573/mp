import { createEffect, Match, Switch, useContext } from "solid-js";
import { EngineProvider } from "@mp/engine";
import { AuthContext } from "@mp/auth-client";
import { createQuery, skipToken } from "@tanstack/solid-query";
import { Application } from "@mp/solid-pixi";
import {
  createGameClient,
  createSyncClient,
  GameClientContext,
} from "../../clients/game";
import { loadAreaResource } from "../../state/loadAreaResource";
import { Dock } from "../../ui/Dock";
import { LoadingSpinner } from "../../ui/LoadingSpinner";
import * as styles from "./GamePage.css";
import { AreaScene } from "./AreaScene";

export default function GamePage() {
  const auth = useContext(AuthContext);
  const sync = createSyncClient(auth);
  const game = createGameClient(sync);
  const area = createQuery(() => {
    const id = game.areaId();
    return {
      queryKey: ["area", id],
      queryFn: id ? () => loadAreaResource(id) : skipToken,
      refetchOnWindowFocus: false,
    };
  });

  createEffect(() => {
    if (game.readyState() === "open") {
      void game.join();
    }
  });

  return (
    <GameClientContext.Provider value={game}>
      <Switch>
        <Match when={!auth.isSignedIn()}>
          <Dock position="center">Sign in to play</Dock>
        </Match>
        <Match when={game.readyState() !== "open" || area.isPending}>
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
    </GameClientContext.Provider>
  );
}
