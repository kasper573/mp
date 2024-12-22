import { Match, Switch, Show, useContext } from "solid-js";
import { atoms } from "@mp/style";
import { EngineProvider } from "@mp/engine";
import { AuthContext } from "@mp/auth-client";
import { createQuery } from "@tanstack/solid-query";
import { Application } from "@mp/solid-pixi";
import { createGameClient, GameClientContext } from "../../clients/game";
import { loadAreaResource } from "../../state/loadAreaResource";
import * as styles from "./GamePage.css";
import { AreaScene } from "./AreaScene";

export default function GamePage() {
  const auth = useContext(AuthContext);

  return (
    <Switch>
      <Match when={auth.isSignedIn()}>
        <Game />
      </Match>
      <Match when={!auth.isSignedIn()}>
        <div class={atoms({ padding: "2xl" })}>Sign in to play</div>
      </Match>
    </Switch>
  );
}

function Game() {
  const auth = useContext(AuthContext);
  const gameClient = createGameClient(auth);

  const area = createQuery(() => {
    const id = gameClient.areaId();
    return {
      queryKey: ["area", id],
      queryFn: () => (id ? loadAreaResource(id) : null),
    };
  });

  void gameClient.join();
  return (
    <GameClientContext.Provider value={gameClient}>
      <Application class={styles.container}>
        {({ viewport }) => (
          <EngineProvider viewport={viewport}>
            <Show when={area.data} keyed>
              {(data) => <AreaScene area={data} />}
            </Show>
          </EngineProvider>
        )}
      </Application>
    </GameClientContext.Provider>
  );
}
