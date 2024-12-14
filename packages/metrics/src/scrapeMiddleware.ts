import type { Registry } from "prom-client";
import { createMiddleware } from "jsr:@hono/hono/factory";
import { getConnInfo } from "jsr:@hono/hono/deno";
import type { Context } from "jsr:@hono/hono";

/**
 * Middleware that serves the metrics from the given registry.
 * This is the endpoint that Prometheus will scrape.
 */
export function createMetricsScrapeMiddleware(
  registry: Registry,
) {
  return createMiddleware(async (ctx, next) => {
    ctx.req.raw;
    if (ctx.req.path === "/metrics" && isAllowedToAccessMetrics(ctx)) {
      ctx.res = new Response(await registry.metrics(), {
        status: 200,
        headers: {
          "Content-Type": registry.contentType,
        },
      });
    } else {
      await next();
    }
  });
}

function isAllowedToAccessMetrics(ctx: Context) {
  const { address } = getConnInfo(ctx).remote;
  return address?.startsWith("127.") || address?.startsWith("172.");
}
