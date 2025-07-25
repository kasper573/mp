import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsGague } from "@mp/telemetry/prom";
import type { GameState } from "@mp/game/server";

export function collectGameStateMetrics(
  registry: MetricsRegistry,
  state: GameState,
) {
  return [
    new MetricsGague({
      name: "active_character_count",
      help: "Number of player characters currently active",
      registers: [registry],
      collect() {
        this.set(
          state.actors
            .values()
            .filter((actor) => actor.type === "character")
            .toArray().length,
        );
      },
    }),
    new MetricsGague({
      name: "active_npc_count",
      help: "Number of non-player characters currently active",
      registers: [registry],
      collect() {
        this.set(
          state.actors
            .values()
            .filter((actor) => actor.type === "npc")
            .toArray().length,
        );
      },
    }),
  ];
}
