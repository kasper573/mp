import type { MetricsRegistry } from "@mp/metrics";
import { MetricsGague } from "@mp/metrics";
import { worldState } from "../../main";
import type { ClientRegistry } from "./ClientRegistry";

export function collectUserMetrics(
  registry: MetricsRegistry,
  clients: ClientRegistry,
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
      this.set(clients.getCharacterCount());
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
