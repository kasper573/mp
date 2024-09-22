import { createSignal } from "solid-js";
import { useAuthState } from "@mp/auth/client";
import { Application } from "@mp/pixi/solid";
import { Game } from "../../game/Game";
import { DebugText } from "../../game/DebugText";
import * as styles from "./GamePage.css";

export default function GamePage() {
  const { isSignedIn } = useAuthState();

  if (!isSignedIn) {
    return <div>Sign in to play</div>;
  }

  return (
    <>
      <Application class={styles.container}>
        <Game />
      </Application>
      <DebugText />
    </>
  );
}
