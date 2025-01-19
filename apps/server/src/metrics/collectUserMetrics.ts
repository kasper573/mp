import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsGague } from "@mp/telemetry/prom";
import type { WorldSyncServer } from "../modules/world/WorldState";
import type { ClientRegistry } from "../ClientRegistry";

export function collectUserMetrics(
  registry: MetricsRegistry,
  clients: ClientRegistry,
  worldState: WorldSyncServer,
) {
  new MetricsGague({
    name: "active_user_count",
    help: "Number of users currently connected",
    registers: [registry],
    collect() {
      this.set(clients.getUserCount());
    },
  });

  new MetricsGague({
    name: "active_character_count",
    help: "Number of player characters currently active",
    registers: [registry],
    collect() {
      worldState.access(
        "collectUserMetrics.active_character_count",
        (state) => {
          this.set(Object.values(state.characters).length);
        },
      );
    },
  });

  new MetricsGague({
    name: "active_npc_count",
    help: "Number of non-player characters currently active",
    registers: [registry],
    collect() {
      worldState.access("collectUserMetrics.active_npc_count", (state) => {
        this.set(Object.values(state.npcs).length);
      });
    },
  });

  new MetricsGague({
    name: "active_client_count",
    help: "Number of active websocket connections",
    registers: [registry],
    collect() {
      this.set([...worldState.clientIds].length);
    },
  });
}
