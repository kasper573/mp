import type express from "express";
import type { Registry } from "prom-client";

export {
  collectDefaultMetrics,
  Gauge as MetricsGague,
  Registry as MetricsRegistry,
  Histogram as MetricsHistogram,
  exponentialBuckets,
  linearBuckets,
  Pushgateway,
  type PrometheusContentType,
} from "prom-client";

/**
 * Middleware that serves the metrics from the given registry.
 * This is the endpoint that Prometheus will scrape.
 */
export function metricsMiddleware(registry: Registry): express.RequestHandler {
  return function metricsMiddleware(req, res, next) {
    if (isAllowedToAccessMetrics(req) && req.path === "/metrics") {
      res.set("Content-Type", "text/plain");
      registry
        .metrics()
        .then((data) => res.send(data))
        .catch(() => res.status(500).send("Error scraping metrics"));
    } else {
      next();
    }
  };
}

function isAllowedToAccessMetrics(req: express.Request) {
  return req.ip?.startsWith("127.") || req.ip?.startsWith("172.");
}
