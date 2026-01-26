import type { JSX } from "solid-js";
import * as styles from "./game-debug-ui.css";

export function GameDebugUi(props: { children?: JSX.Element }) {
  return (
    <div class={styles.debugMenu}>
      {/* Intentionally only stop propagation for the controls and not the debug info since
          the debug info takes up so much space it would interfere with testing the game.*/}
      <div onPointerDown={(e) => e.stopPropagation()}>{props.children}</div>
    </div>
  );
}
