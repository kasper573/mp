import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsGague } from "@mp/telemetry/prom";
import { opt } from "../options";

export function collectProcessMetrics(metrics: MetricsRegistry) {
  new MetricsGague({
    name: "process_uptime_seconds",
    help: "Time since the process started in seconds",
    registers: [metrics],
    labelNames: ["version", "branch"],
    collect() {
      this.set(
        { version: opt.buildVersion, branch: opt.buildBranch },
        process.uptime(),
      );
    },
  });
}
