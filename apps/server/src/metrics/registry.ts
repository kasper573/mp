import { MetricsRegistry } from "@mp/telemetry/prom";

let globalMetricsRegistry: MetricsRegistry | undefined;

export function setGlobalMetricsRegistry(registry: MetricsRegistry) {
  globalMetricsRegistry = registry;
}

export function getGlobalMetricsRegistry(): MetricsRegistry | undefined {
  return globalMetricsRegistry;
}