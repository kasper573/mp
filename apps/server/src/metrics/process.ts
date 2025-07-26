import { MetricsGague } from "@mp/telemetry/prom";

export function collectProcessMetrics() {
  return new MetricsGague({
    name: "process_uptime_seconds",
    help: "Time since the process started in seconds",
    collect() {
      this.set(process.uptime());
    },
  });
}
