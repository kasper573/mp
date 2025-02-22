import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsHistogram } from "@mp/telemetry/prom";
import type { TickMiddleware } from "@mp/time";
import { beginMeasuringTimeSpan } from "@mp/time";
import { tickBuckets } from "./shared";

export function createTickMetricsObserver(
  metrics: MetricsRegistry,
): TickMiddleware {
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

  return async ({ next, ...event }) => {
    interval.observe(event.timeSinceLastTick.totalMilliseconds);
    const getMeasurement = beginMeasuringTimeSpan();
    await next(event);
    duration.observe(getMeasurement().totalMilliseconds);
  };
}
