import { MetricsHistogram } from "@mp/telemetry/prom";
import { byteBuckets } from "./shared";

export const gameStateFlushHistogram = new MetricsHistogram({
  name: "game_state_flush_size_bytes",
  help: "Size of the game state flush sent each server tick to gateway in bytes",
  buckets: byteBuckets,
});
