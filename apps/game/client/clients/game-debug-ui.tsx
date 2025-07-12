import type { ComponentChildren } from "preact";
import * as styles from "./game-debug-ui.css";

export function GameDebugUi({ children }: { children?: ComponentChildren }) {
  return (
    <div className={styles.debugMenu}>
      {/* Intentionally only stop propagation for the controls and not the debug info since 
          the debug info takes up so much space it would interfere with testing the game.*/}
      <div onPointerDown={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
