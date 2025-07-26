import { flushResultEncoding } from "@mp/sync";
import type { GameState, GameStateServer } from "@mp/game/server";
import type { WebSocket } from "@mp/ws/server";
import { MetricsHistogram } from "@mp/telemetry/prom";
import type { TickEventHandler } from "@mp/time";
import { byteBuckets } from "../metrics/shared";

export function createGameStateFlusher(
  state: GameState,
  server: GameStateServer,
  gatewaySocket: WebSocket,
): TickEventHandler {
  const histogram = new MetricsHistogram({
    name: "game_state_flush_size_bytes",
    help: "Size of the game state flush sent each server tick to gateway in bytes",
    buckets: byteBuckets,
  });
  return () => {
    const flushResult = server.flush(state);
    if (flushResult.clientEvents.size || flushResult.clientPatches.size) {
      const time = new Date();
      const encoded = flushResultEncoding().encode([flushResult, time]);
      histogram.observe(encoded.byteLength);
      gatewaySocket.send(encoded);
    }
  };
}
