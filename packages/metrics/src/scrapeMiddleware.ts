import type express from "express";
import type { Registry } from "prom-client";

/**
 * Middleware that serves the metrics from the given registry.
 * This is the endpoint that Prometheus will scrape.
 */
export function createMetricsScrapeMiddleware(
  registry: Registry,
): express.RequestHandler {
  return (req, res, next) => {
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
