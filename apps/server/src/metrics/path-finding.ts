import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsHistogram } from "@mp/telemetry/prom";
import { AreaResource } from "@mp/game/server";
import { msBuckets } from "./shared";

export function collectPathFindingMetrics(registry: MetricsRegistry): void {
  const pathFinderHistogram = new MetricsHistogram({
    name: "findPath",
    help: "Path finding algorithm",
    registers: [registry],
    buckets: msBuckets,
  });

  AreaResource.findPathMiddleware = (args, next) => {
    const before = performance.now();
    const result = next(...args);
    const deltaMs = performance.now() - before;
    pathFinderHistogram.observe(deltaMs);
    return result;
  };
}
