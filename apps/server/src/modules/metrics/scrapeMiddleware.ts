import type express from "express";
import type { MetricsRegistry } from "./registry";

export function createMetricsScrapeMiddleware(
  registry: MetricsRegistry,
): express.RequestHandler {
  return (req, res, next) => {
    if (req.path === "/metrics") {
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
