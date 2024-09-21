import { signal, useSignal } from "@mp/state";
import * as styles from "./DebugText.css";

export const debugText = signal("");

export function DebugText() {
  const [text] = useSignal(debugText);
  if (!text) {
    return null;
  }
  return (
    <span className={styles.debugText({ visible: !!debugText })}>{text}</span>
  );
}
