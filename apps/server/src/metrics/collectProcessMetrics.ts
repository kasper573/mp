import type { MetricsRegistry } from "../../../../packages/telemetry/prom/mod";
import { MetricsGague } from "../../../../packages/telemetry/prom/mod";

export function collectProcessMetrics(metrics: MetricsRegistry) {
  new MetricsGague({
    name: "process_uptime_seconds",
    help: "Time since the process started in seconds",
    registers: [metrics],
    collect() {
      this.set(process.uptime());
    },
  });
}
