import { MetricsRegistry, type MetricsHistogram } from "@mp/telemetry/prom";
import { beginMeasuringTimeSpan } from "@mp/time";

export const tickBuckets = [
  0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 7, 10, 12, 16, 24, 36, 48, 65, 100, 200,
  400, 600, 800, 1000,
];

export const metricsRegistry = new MetricsRegistry();

export function observe<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
  histogram: MetricsHistogram,
) {
  return function measuredFn(...args: Args): Result {
    const getMeasurement = beginMeasuringTimeSpan();
    const result = fn(...args);
    histogram.observe(getMeasurement().totalMilliseconds);
    return result;
  };
}
