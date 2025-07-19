import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsGague } from "@mp/telemetry/prom";
import type { AreaLookup, ClientRegistry, GameState } from "@mp/game/server";

export function collectGameStateMetrics(
  registry: MetricsRegistry,
  clients: ClientRegistry,
  state: GameState,
  areas: AreaLookup,
) {
  return [
    new MetricsGague({
      name: "active_user_count",
      help: "Number of users currently connected",
      registers: [registry],
      collect() {
        this.set(clients.getUserCount());
      },
    }),

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
      name: "server_area_count",
      help: "Number of areas loaded in the server",
      registers: [registry],
      collect() {
        this.set(areas.size);
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

    new MetricsGague({
      name: "active_client_count",
      help: "Number of active websocket connections",
      registers: [registry],
      collect() {
        this.set(clients.getClientIds().size);
      },
    }),
  ];
}
