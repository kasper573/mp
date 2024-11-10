import { collectDefaultMetrics, Registry } from "prom-client";

export function createMetricsRegistry() {
  const register = new Registry();
  register.setDefaultLabels({ serviceName: "mp" });
  collectDefaultMetrics({ register });
  return register;
}

export { type Registry as MetricsRegistry } from "prom-client";
