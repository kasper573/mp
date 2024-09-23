import { useAuthState } from "@mp/auth/client";
import { Application } from "@mp/pixi/solid";
import { Match, Switch } from "solid-js";
import { atoms } from "@mp/style";
import { Game } from "../../game/Game";
import * as styles from "./GamePage.css";

export default function GamePage() {
  const { isSignedIn } = useAuthState();

  return (
    <Switch>
      <Match when={isSignedIn()}>
        <Application class={styles.container}>
          <Game />
        </Application>
      </Match>
      <Match when={!isSignedIn()}>
        <div class={atoms({ padding: "2xl" })}>Sign in to play</div>
      </Match>
    </Switch>
  );
}
