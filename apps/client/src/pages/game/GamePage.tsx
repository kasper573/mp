import { createEffect, Match, Switch, useContext } from "solid-js";
import { EngineProvider } from "@mp/engine";
import { AuthContext } from "@mp/auth-client";
import { createQuery } from "@tanstack/solid-query";
import { Application } from "@mp/solid-pixi";
import {
  createGameClient,
  createSyncClient,
  GameClientContext,
} from "../../clients/game";
import { loadAreaResource } from "../../state/loadAreaResource";
import { Dock } from "../../ui/Dock";
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
      queryFn: () => {
        if (!id) {
          throw new Error("No area id available in game client");
        }
        return loadAreaResource(id);
      },
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
        <Match when={game.readyState() !== "open"}>
          <Dock position="center">Game client {game.readyState()}</Dock>
        </Match>
        <Match when={area.isPending}>
          <Dock position="center">Loading area...</Dock>
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
