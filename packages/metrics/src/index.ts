export {
  collectDefaultMetrics,
  Gauge as MetricsGague,
  Histogram as MetricsHistogram,
  Registry as MetricsRegistry,
} from "prom-client";
export * from "./scrapeMiddleware.ts";

// TODO replace with https://deno.land/x/ts_prometheus@v0.3.0
