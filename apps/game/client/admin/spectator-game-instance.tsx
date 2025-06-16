import { createSignal, createEffect } from "solid-js";
import type { UserId } from "@mp/auth";
import { useRpc } from "../use-rpc";
import { SpectatorGameClient } from "./spectator-game-client";
import * as styles from "./spectator-game-instance.css";

interface SpectatorGameInstanceProps {
  userId: UserId;
}

export function SpectatorGameInstance(props: SpectatorGameInstanceProps) {
  const rpc = useRpc();
  const [playerName, setPlayerName] = createSignal<string>("Unknown");

  const activePlayers = rpc.world.listActivePlayers.useQuery(() => ({
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
      </div>

      <div class={styles.gameContainer}>
        <SpectatorGameClient userId={props.userId} />
      </div>
    </div>
  );
}
