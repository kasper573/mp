import { consoleLoggerHandler, Logger } from "@mp/logger";
import type { AreaId } from "@mp/data";
import type { RootRouter } from "@mp/server";
import { transformer } from "@mp/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { readCliOptions } from "./cli";

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

const { httpServerUrl, apiServerUrl, httpRequests, rpcRequests, verbose } =
  readCliOptions();

const start = performance.now();
logger.info(
  `Load testing ${httpRequests} http requests and ${rpcRequests} rpc requests`,
);

await loadTestHTTP();
await loadTestRPC();

const end = performance.now();

logger.info(`Done in ${(end - start).toFixed(2)}ms`);

async function loadTestHTTP() {
  const results = await Promise.allSettled(
    range(httpRequests).map(async () => {
      const res = await fetch(httpServerUrl);
      if (!res.ok) {
        throw new Error(`Error: ${res.status} ${res.statusText}`);
      }
    }),
  );

  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  logger.info(
    `HTTP request test: ${successes.length} successes, ${failures.length} failures`,
  );

  if (verbose) {
    for (const result of failures) {
      logger.error(result.reason);
    }
  }
}

async function loadTestRPC() {
  const trpc = createTRPCClient<RootRouter>({
    links: [httpBatchLink({ url: apiServerUrl, transformer })],
  });

  const results = await Promise.allSettled(
    range(rpcRequests).map(() =>
      trpc.area.areaFileUrl.query("forest" as AreaId),
    ),
  );

  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  logger.info(
    `RPC test: ${successes.length} successes, ${failures.length} failures`,
  );

  if (verbose) {
    for (const result of failures) {
      logger.error(result.reason);
    }
  }
}

function range(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1);
}
