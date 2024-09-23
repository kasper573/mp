import { useAuthState } from "@mp/auth/client";
import { Application } from "@mp/pixi/solid";
import { Match, Switch } from "solid-js";
import { Game } from "../../game/Game";
import * as styles from "./GamePage.css";

export default function GamePage() {
  const { isSignedIn } = useAuthState();

  return (
    <Switch>
      <Match when={isSignedIn()}>
        <div class={styles.container}>
          <Application>
            <Game />
          </Application>
        </div>
      </Match>
      <Match when={!isSignedIn()}>Sign in to play</Match>
    </Switch>
  );
}
