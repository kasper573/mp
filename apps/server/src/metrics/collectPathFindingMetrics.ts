import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsHistogram } from "@mp/telemetry/prom";
import { beginMeasuringTimeSpan } from "@mp/time";
import { AreaResource } from "@mp-modules/data";
import { tickBuckets } from "./shared";

export function collectPathFindingMetrics(registry: MetricsRegistry): void {
  const pathFinderHistogram = new MetricsHistogram({
    name: "findPath",
    help: "Path finding algorithm",
    registers: [registry],
    buckets: tickBuckets,
  });

  AreaResource.findPathMiddleware = (args, next) => {
    const getMeasurement = beginMeasuringTimeSpan();
    const result = next(...args);
    pathFinderHistogram.observe(getMeasurement().totalMilliseconds);
    return result;
  };
}
