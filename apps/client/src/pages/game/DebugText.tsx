import * as styles from "./DebugText.css";

export function DebugText({ debugText }: { debugText?: string }) {
  return (
    <span className={styles.debugText({ visible: !!debugText })}>
      {debugText}
    </span>
  );
}
