import type { MetricsRegistry } from "@mp/metrics";
import { MetricsGague } from "@mp/metrics";
import type { SyncServer } from "@mp/sync-server";
import type { ClientRegistry } from "./ClientRegistry";
import type { WorldState } from "./schema";

export function collectUserMetrics<T>(
  registry: MetricsRegistry,
  clients: ClientRegistry,
  worldState: SyncServer<WorldState, T>,
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
      worldState.access("collectUserMetrics", (state) => {
        this.set(Object.values(state.characters).length);
      });
    },
  });

  new MetricsGague({
    name: "active_client_count",
    help: "Number of active websocket connections",
    registers: [registry],
    collect() {
      this.set(worldState.clientIds.length);
    },
  });
}
