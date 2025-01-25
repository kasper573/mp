import type { WorldState } from "@mp/server";
import * as styles from "./WorldStateInspector.css";

export function WorldStateInspector(props: { worldState?: WorldState }) {
  return (
    <pre class={styles.worldStateInspector}>
      {JSON.stringify(props.worldState, null, 2)}
    </pre>
  );
}
