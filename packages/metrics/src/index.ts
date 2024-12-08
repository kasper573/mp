export {
  collectDefaultMetrics,
  Gauge as MetricsGague,
  Registry as MetricsRegistry,
  Histogram as MetricsHistogram,
} from "prom-client";
export * from "./scrapeMiddleware.ts";
