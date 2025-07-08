import type { ParentProps } from "solid-js";
import { Show, useContext } from "solid-js";
import * as styles from "./game-debug-ui.css";
import { GameDebugUiContext } from "./game-debug-ui-state";

export function GameDebugUi(props: ParentProps) {
  const { setPortalContainer, enabled } = useContext(GameDebugUiContext);

  return (
    <Show when={enabled()}>
      <div class={styles.debugMenu}>
        {/* Intentionally only stop propagation for the controls and not the debug info since 
          the debug info takes up so much space it would interfere with testing the game.*/}
        <div on:pointerdown={(e) => e.stopPropagation()}>
          <div ref={setPortalContainer} />
          {props.children}
        </div>
      </div>
    </Show>
  );
}
