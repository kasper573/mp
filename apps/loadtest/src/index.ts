import { consoleLoggerHandler, Logger } from "@mp/logger";
import type { AreaId } from "@mp/data";
import type { RootRouter, WorldState } from "@mp/server";
import { transformer } from "@mp/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { SyncClient } from "@mp/sync/client";
import { readCliOptions } from "./cli";

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

const {
  wsUrl,
  httpServerUrl,
  apiServerUrl,
  httpRequests,
  rpcRequests,
  gameClients,
  gameClientTestTimeout,
  verbose,
} = readCliOptions();

const start = performance.now();

await Promise.all([loadTestHTTP(), loadTestRPC(), loadTestGameClients()]);

const end = performance.now();

logger.info(`Done in ${(end - start).toFixed(2)}ms`);

async function loadTestHTTP() {
  logger.info("Testing", httpRequests, "HTTP requests");
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
    `HTTP request test finished: ${successes.length} successes, ${failures.length} failures`,
  );

  if (verbose) {
    for (const result of failures) {
      logger.error(result.reason);
    }
  }
}

async function loadTestRPC() {
  logger.info("Testing", rpcRequests, "RPC requests");
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
    `RPC test finished: ${successes.length} successes, ${failures.length} failures`,
  );

  if (verbose) {
    for (const result of failures) {
      logger.error(result.reason);
    }
  }
}

async function loadTestGameClients() {
  logger.info("Testing", gameClients, "game clients");

  const results = await Promise.allSettled(
    range(gameClients).map(testGameClient),
  );

  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  logger.info(
    `Game client test finished: ${successes.length} successes, ${failures.length} failures`,
  );

  if (verbose) {
    for (const result of failures) {
      logger.error(result.reason);
    }
  }
}

async function testGameClient() {
  const sync = new SyncClient<WorldState>(wsUrl, () => ({
    token: "anonymous",
  }));

  try {
    await new Promise<void>((resolve, reject) => {
      sync.subscribeToErrors((e) => {
        clearTimeout(timeoutId);
        reject(new Error(e.message));
      });
      sync.start();
      const timeoutId = setTimeout(resolve, gameClientTestTimeout);
    });
  } finally {
    sync.stop();
  }
}

function range(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1);
}
