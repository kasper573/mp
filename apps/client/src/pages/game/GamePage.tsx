import { useState } from "react";
import { useAuthState } from "@mp/auth/client";
import { Application } from "@mp/pixi/react";
import { Game } from "../../game/Game";
import { DebugText } from "../../game/DebugText";
import * as styles from "./GamePage.css";

export default function GamePage() {
  const { isSignedIn } = useAuthState();
  const [resizeTo, setResizeTo] = useState<HTMLDivElement | null>(null);

  if (!isSignedIn) {
    return <div>Sign in to play</div>;
  }

  return (
    <div ref={setResizeTo} className={styles.container}>
      <Application resizeTo={resizeTo}>
        <Game />
      </Application>
      <DebugText />
    </div>
  );
}
