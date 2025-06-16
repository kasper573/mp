import { createMemo, For, Show } from "solid-js";
import type { UserId } from "@mp/auth";
import { SpectatorGameInstance } from "./spectator-game-instance";
import * as styles from "./spectator-game-grid.css";

interface SpectatorGameGridProps {
  spectatedPlayers: UserId[];
}

export function SpectatorGameGrid(props: SpectatorGameGridProps) {
  const gridLayout = createMemo(() => {
    const count = props.spectatedPlayers.length;
    if (count === 0) return { cols: 1, rows: 1 };
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 9) return { cols: 3, rows: 3 };
    if (count <= 12) return { cols: 4, rows: 3 };
    if (count <= 16) return { cols: 4, rows: 4 };
    return { cols: 5, rows: Math.ceil(count / 5) };
  });

  return (
    <div class={styles.container}>
      <Show 
        when={props.spectatedPlayers.length > 0} 
        fallback={
          <div class={styles.emptyState}>
            <h3 class={styles.emptyStateTitle}>No Players Selected</h3>
            <p class={styles.emptyStateText}>Add players from the sidebar to start spectating</p>
          </div>
        }
      >
        <div 
          class={styles.grid} 
          style={{
            "grid-template-columns": `repeat(${gridLayout().cols}, 1fr)`,
            "grid-template-rows": `repeat(${gridLayout().rows}, 1fr)`,
          }}
        >
          <For each={props.spectatedPlayers}>
            {(userId) => (
              <div class={styles.gameSlot}>
                <SpectatorGameInstance userId={userId} />
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}