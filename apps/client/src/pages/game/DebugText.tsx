import { useSyncExternalStore } from "react";
import { api } from "../../api";
import * as styles from "./DebugText.css";

export function DebugText({ debugText }: { debugText?: string }) {
  const connected = useSyncExternalStore(
    (fn) => api.connected.subscribe(fn),
    () => api.connected.value,
  );

  return (
    <>
      {!connected && <div>Connecting...</div>}
      <span className={styles.debugText({ visible: !!debugText })}>
        {debugText}
      </span>
    </>
  );
}
