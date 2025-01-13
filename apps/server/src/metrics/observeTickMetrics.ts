import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsHistogram } from "@mp/telemetry/prom";
import type { TickMiddleware } from "@mp/time";
import { measureTimeSpan } from "@mp/time";

export function createTickMetricsObserver(
  metrics: MetricsRegistry,
): TickMiddleware {
  const tickBuckets = [
    0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 7, 10, 12, 16, 24, 36, 48, 65, 100, 200,
    400, 600, 800, 1000,
  ];

  const interval = new MetricsHistogram({
    name: "server_tick_interval",
    help: "Time between each server tick in milliseconds",
    registers: [metrics],
    buckets: tickBuckets,
  });

  const duration = new MetricsHistogram({
    name: "server_tick_duration",
    help: "Time taken to process each server tick in milliseconds",
    registers: [metrics],
    buckets: tickBuckets,
  });

  return ({ delta, next }) => {
    interval.observe(delta.totalMilliseconds);
    const getMeasurement = measureTimeSpan();
    next(delta);
    duration.observe(getMeasurement().totalMilliseconds);
  };
}
