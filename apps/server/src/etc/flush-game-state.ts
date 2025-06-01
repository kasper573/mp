import { syncMessageEncoding } from "@mp/sync";
import type { GameState, GameStateEmitter } from "@mp/game/server";
import type { WebSocket } from "@mp/ws/server";
import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsHistogram } from "@mp/telemetry/prom";
import type { TickEventHandler } from "@mp/time";
import { byteBuckets } from "../metrics/shared";
import { getSocketId } from "./get-socket-id";

export function createGameStateFlusher(
  state: GameState,
  emitter: GameStateEmitter,
  clients: Iterable<WebSocket>,
  metrics: MetricsRegistry,
): TickEventHandler {
  const histogram = new MetricsHistogram({
    name: "game_state_flush_patch_size_bytes",
    help: "Size of the game state patch sent each server tick to clients in bytes",
    registers: [metrics],
    buckets: byteBuckets,
  });
  return () => {
    const time = new Date();
    const { clientPatches, clientEvents } = emitter.flush(state);
    for (const socket of clients) {
      const clientId = getSocketId(socket);
      const patch = clientPatches.get(clientId);
      const events = clientEvents.get(clientId);
      if (patch || events) {
        const encodedPatch = syncMessageEncoding.encode([patch, time, events]);
        histogram.observe(encodedPatch.byteLength);
        socket.send(encodedPatch);
      }
    }
  };
}
