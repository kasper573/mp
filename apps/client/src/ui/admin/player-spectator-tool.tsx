import { createSignal, For, Show } from "solid-js";
import type { UserId } from "@mp/auth";
import { Button } from "@mp/ui";
import { useRpc } from "../../integrations/rpc";
import { SpectatorGameGrid } from "./spectator-game-grid";
import * as styles from "./player-spectator-tool.css";

export function PlayerSpectatorTool() {
  const rpc = useRpc();
  const [spectatedPlayers, setSpectatedPlayers] = createSignal<UserId[]>([]);

  const activePlayers = rpc.spectator.listActivePlayers.useQuery(() => ({
    input: void 0,
  }));

  const addPlayerToSpectate = (userId: UserId) => {
    setSpectatedPlayers((current) => {
      if (current.includes(userId)) {
        return current;
      }
      return [...current, userId];
    });
  };

  const removePlayerFromSpectate = (userId: UserId) => {
    setSpectatedPlayers((current) => current.filter((id) => id !== userId));
  };

  const clearAllSpectatedPlayers = () => {
    setSpectatedPlayers([]);
  };

  return (
    <div class={styles.container}>
      <div class={styles.sidebar}>
        <h2>Player Spectator</h2>

        <div class={styles.section}>
          <h3>Active Players</h3>
          <Show
            when={activePlayers.data}
            fallback={<div>Loading players...</div>}
          >
            <For each={activePlayers.data}>
              {(player) => (
                <div class={styles.playerItem}>
                  <div class={styles.playerInfo}>
                    <div class={styles.playerName}>{player.username}</div>
                    <div class={styles.playerArea}>Area: {player.areaId}</div>
                  </div>
                  <Button
                    onClick={() => addPlayerToSpectate(player.userId)}
                    disabled={spectatedPlayers().includes(player.userId)}
                  >
                    {spectatedPlayers().includes(player.userId)
                      ? "Spectating"
                      : "Add"}
                  </Button>
                </div>
              )}
            </For>
          </Show>
        </div>

        <div class={styles.section}>
          <h3>Spectated Players ({spectatedPlayers().length})</h3>
          <Show when={spectatedPlayers().length > 0}>
            <Button onClick={clearAllSpectatedPlayers}>Clear All</Button>
          </Show>
          <For each={spectatedPlayers()}>
            {(userId) => {
              const player = () =>
                activePlayers.data?.find((p) => p.userId === userId);
              return (
                <div class={styles.spectatedPlayerItem}>
                  <div class={styles.playerInfo}>
                    <div class={styles.playerName}>
                      {player()?.username || "Unknown"}
                    </div>
                  </div>
                  <Button onClick={() => removePlayerFromSpectate(userId)}>
                    Remove
                  </Button>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      <div class={styles.gameGrid}>
        <SpectatorGameGrid spectatedPlayers={spectatedPlayers()} />
      </div>
    </div>
  );
}
