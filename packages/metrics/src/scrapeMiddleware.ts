import type { Registry } from "prom-client";

/**
 * Middleware that serves the metrics from the given registry.
 * This is the endpoint that Prometheus will scrape.
 */
export function createMetricsScrapeMiddleware(
  registry: Registry
): RequestHandlerLike {
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

function isAllowedToAccessMetrics(req: RequestLike) {
  return req.ip?.startsWith("127.") || req.ip?.startsWith("172.");
}

interface RequestHandlerLike {
  (req: RequestLike, res: ResponseLike, next: () => void): void;
}

interface RequestLike {
  path?: string;
  ip?: string;
}

interface ResponseLike {
  set(header: string, value: string): void;
  send(data: string): void;
  status(code: number): ResponseLike;
}
