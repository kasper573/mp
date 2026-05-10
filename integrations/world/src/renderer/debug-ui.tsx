import { createContext, type ComponentChildren } from "preact";
import * as styles from "./debug-ui.css";
import { useContext, type ReactNode } from "preact/compat";

export function GameDebugUi({ children }: { children?: ComponentChildren }) {
  const additionalUi = useContext(AdditionalDebugUiContext);
  return (
    <div
      className={styles.debugMenu}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {additionalUi}
      {children}
    </div>
  );
}

export const AdditionalDebugUiContext = createContext<ReactNode | undefined>(
  undefined,
);
