import type { ReactNode } from "react";
import * as styles from "./game-debug-ui.css";

export function GameDebugUi({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.debugMenu}>
      {/* Intentionally only stop propagation for the controls and not the debug info since 
          the debug info takes up so much space it would interfere with testing the game.*/}
      <div onPointerDown={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
