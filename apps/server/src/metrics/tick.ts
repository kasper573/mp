import type { MetricsRegistry } from "@mp/telemetry/prom";
import { MetricsHistogram } from "@mp/telemetry/prom";
import type { TickMiddleware } from "@mp/time";

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

  return (opt) => {
    interval.observe(opt.timeSinceLastTick.totalMilliseconds);

    const before = performance.now();
    opt.next(opt);
    const deltaMs = performance.now() - before;
    duration.observe(deltaMs);
  };
}
