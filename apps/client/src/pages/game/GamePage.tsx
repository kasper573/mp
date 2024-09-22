import { useAuthState } from "@mp/auth/client";
import { Application } from "@mp/pixi/solid";
import { Match, Switch } from "solid-js";
import { Game } from "../../game/Game";
import { DebugText } from "../../game/DebugText";
import * as styles from "./GamePage.css";

export default function GamePage() {
  const { isSignedIn } = useAuthState();

  return (
    <Switch>
      <Match when={isSignedIn()}>
        <Application class={styles.container}>
          <Game />
        </Application>
        <DebugText />
      </Match>
      <Match when={!isSignedIn()}>Sign in to play</Match>
    </Switch>
  );
}
