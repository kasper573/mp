import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsGague } from "@mp/telemetry/prom";
import type { ClientRegistry, GameState } from "@mp/game/server";

export function* collectUserMetrics(
  registry: MetricsRegistry,
  clients: ClientRegistry,
  state: GameState,
) {
  yield new MetricsGague({
    name: "active_user_count",
    help: "Number of users currently connected",
    registers: [registry],
    collect() {
      this.set(clients.getUserCount());
    },
  });

  yield new MetricsGague({
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
  });

  yield new MetricsGague({
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
  });

  yield new MetricsGague({
    name: "active_client_count",
    help: "Number of active websocket connections",
    registers: [registry],
    collect() {
      this.set(clients.getClientIds().size);
    },
  });
}
