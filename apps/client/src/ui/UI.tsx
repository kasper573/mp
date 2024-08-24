import type { CSSProperties } from "react";
import { useSyncExternalStore } from "react";
import { api } from "../api";

export function UI({ debugText }: { debugText?: string }) {
  const connected = useSyncExternalStore(
    (fn) => api.connected.subscribe(fn),
    () => api.connected.value,
  );

  return (
    <>
      {!connected && <div>Connecting...</div>}
      <span style={styles.debugText(!!debugText)}>{debugText}</span>
    </>
  );
}

const styles = {
  debugText: (enabled: boolean) => ({
    whiteSpace: "pre-wrap",
    position: "absolute",
    top: 8,
    left: 8,
    background: "rgba(0, 0, 0, 0.5)",
    color: "white",
    padding: "8px",
    borderRadius: "8px",
    pointerEvents: "none",
    display: enabled ? "block" : "none",
  }),
} satisfies Record<string, (...args: never[]) => CSSProperties>;
