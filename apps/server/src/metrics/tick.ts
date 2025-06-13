import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsHistogram } from "@mp/telemetry/prom";
import type { TickMiddleware } from "@mp/time";
import { beginMeasuringTimeSpan } from "@mp/time";
import { opt } from "../options";
import { msBuckets } from "./shared";

export function createTickMetricsObserver(
  metrics: MetricsRegistry,
): TickMiddleware {
  const interval = new MetricsHistogram({
    name: "server_tick_interval",
    help: "Time between each server tick in milliseconds",
    registers: [metrics],
    buckets: msBuckets,
  });

  const duration = new MetricsHistogram({
    name: "server_tick_duration",
    help: "Time taken to process each server tick in milliseconds",
    registers: [metrics],
    buckets: msBuckets,
  });

  return ({ next, ...event }) => {
    // It may seem redundant to measure the fixed tick interval here,
    // since it never changes during the server's lifetime.
    // However, this is useful for monitoring purposes, as it allows us to
    // see if there's a correlation between the tick duration and the tick interval.
    // We can measure over long periods of time as server configurations changes.
    interval.observe(opt.tickInterval.totalMilliseconds);

    const getMeasurement = beginMeasuringTimeSpan();
    next(event);
    duration.observe(getMeasurement().totalMilliseconds);
  };
}
