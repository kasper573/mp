import { createSignal, createEffect, Suspense, Show } from "solid-js";
import type { UserId } from "@mp/auth";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import { useRpc } from "../use-rpc";
import { SpectatorGame } from "./spectator-game";
import * as styles from "./spectator-game-instance.css";

interface SpectatorGameInstanceProps {
  userId: UserId;
}

export function SpectatorGameInstance(props: SpectatorGameInstanceProps) {
  const rpc = useRpc();
  const [playerName, setPlayerName] = createSignal<string>("Unknown");

  const playerGameState = rpc.spectator.getPlayerGameState.useQuery(() => ({
    input: { userId: props.userId },
    refetchInterval: 1000, // Refresh every second for real-time updates
  }));

  const activePlayers = rpc.spectator.listActivePlayers.useQuery(() => ({
    input: void 0,
  }));

  createEffect(() => {
    const player = activePlayers.data?.find((p) => p.userId === props.userId);
    if (player) {
      setPlayerName(player.username);
    }
  });

  return (
    <div class={styles.container}>
      <div class={styles.header}>
        <span class={styles.playerName}>{playerName()}</span>
        <Show when={playerGameState.error}>
          <span class={styles.error}>Error</span>
        </Show>
        <Show when={playerGameState.isLoading}>
          <span class={styles.loading}>Loading...</span>
        </Show>
      </div>

      <div class={styles.gameContainer}>
        <Show
          when={playerGameState.data}
          fallback={
            <div class={styles.fallback}>
              <Show
                when={playerGameState.error}
                fallback={<LoadingSpinner debugId="spectator-game-loading" />}
              >
                <ErrorFallback
                  error={playerGameState.error || new Error("Unknown error")}
                />
              </Show>
            </div>
          }
        >
          {(gameStateInfo) => (
            <Suspense
              fallback={<LoadingSpinner debugId="spectator-game-suspense" />}
            >
              <SpectatorGame
                userId={props.userId}
                gameStateInfo={gameStateInfo()}
              />
            </Suspense>
          )}
        </Show>
      </div>
    </div>
  );
}
