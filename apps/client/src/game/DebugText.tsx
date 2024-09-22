import { createSignal } from "solid-js";
import * as styles from "./DebugText.css";

export const [getDebugText, setDebugText] = createSignal("");
export const isDebugTextVisible = () => !!getDebugText();

export function DebugText() {
  return (
    <span class={styles.debugText({ visible: isDebugTextVisible() })}>
      {getDebugText()}
    </span>
  );
}
