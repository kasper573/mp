import type { PatchStateMachine } from "@mp/sync";
import { syncMessageEncoding } from "@mp/sync";
import type { GameState } from "@mp/game/server";
import type { WebSocket } from "@mp/ws/server";
import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsHistogram } from "@mp/telemetry/prom";
import type { TickEventHandler } from "@mp/time";
import { byteBuckets } from "../metrics/shared";
import { getSocketId } from "./get-socket-id";

export function createGameStateFlusher(
  state: PatchStateMachine<GameState>,
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
    const patches = state.$flush();
    for (const socket of clients) {
      const clientId = getSocketId(socket);
      const patch = patches.get(clientId);
      if (patch) {
        const encodedPatch = syncMessageEncoding.encode([patch, time]);
        histogram.observe(encodedPatch.byteLength);
        socket.send(encodedPatch);
      }
    }
  };
}
