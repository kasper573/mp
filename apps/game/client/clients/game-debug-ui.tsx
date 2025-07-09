import type { ParentProps } from "solid-js";
import { Show } from "solid-js";
import * as styles from "./game-debug-ui.css";

export function GameDebugUi(props: ParentProps<{ enabled: boolean }>) {
  return (
    <Show when={props.enabled}>
      <div class={styles.debugMenu}>
        {/* Intentionally only stop propagation for the controls and not the debug info since 
          the debug info takes up so much space it would interfere with testing the game.*/}
        <div on:pointerdown={(e) => e.stopPropagation()}>{props.children}</div>
      </div>
    </Show>
  );
}
