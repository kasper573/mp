import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsGague } from "@mp/telemetry/prom";

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
