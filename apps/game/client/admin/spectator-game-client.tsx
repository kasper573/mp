/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import type { UserId } from "@mp/auth";
import type { JSX } from "solid-js";
import { createSignal, createEffect, onCleanup, useContext, Show } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import { createClient } from "@mp/ws/client";
import { createLogger } from "@mp/logger";
import { Game } from "../game";
import { GameStateClientContext, createGameStateClient } from "../game-state-client";
import { useRpc } from "../use-rpc";
import { createOptimisticGameStateSettings } from "../create-optimistic-game-state";

interface SpectatorGameClientProps {
  userId: UserId;
  class?: string;
  style?: JSX.CSSProperties;
}

export function SpectatorGameClient(props: SpectatorGameClientProps) {
  const auth = useContext(AuthContext);
  const rpc = useRpc();
  const [gameClient, setGameClient] = createSignal<ReturnType<typeof createGameStateClient>>();

  createEffect(() => {
    const user = auth.identity();
    if (!user) return;

    // Create a websocket connection for this spectator
    const socket = createClient({
      url: "/api/game/ws",
      protocols: ["game"],
    });

    const logger = createLogger(`spectator:${props.userId}`);
    const settings = createOptimisticGameStateSettings();
    
    const client = createGameStateClient(rpc, socket, logger, settings);
    
    setGameClient(client);

    // Connect as spectator
    const connectAsSpectator = async () => {
      if (client.readyState() === WebSocket.OPEN) {
        try {
          const characterId = await rpc.world.spectatorJoin({
            token: user.token,
            spectateUserId: props.userId,
          });
          client.setCharacterId(characterId);
        } catch {
          // Handle connection error silently in spectator mode
        }
      }
    };

    // Wait for connection and then join as spectator
    createEffect(() => {
      if (client.readyState() === WebSocket.OPEN) {
        void connectAsSpectator();
      }
    });

    onCleanup(() => {
      if (socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
        socket.close();
      }
    });
  });

  return (
    <Show when={gameClient()} fallback={<div>Connecting...</div>}>
      {(client) => (
        <GameStateClientContext.Provider value={client()}>
          <Game class={props.class} style={props.style} />
        </GameStateClientContext.Provider>
      )}
    </Show>
  );
}