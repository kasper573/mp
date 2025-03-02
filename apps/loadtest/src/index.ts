import { consoleLoggerHandler, Logger } from "@mp/logger";
import type { AreaId } from "@mp/data";
import type { RootRouter } from "@mp/server";
import { tokenHeaderName, transformer } from "@mp/server";
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
  timeout,
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
  const trpc = createRPCClient();

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
}

async function testGameClient(n: number) {
  if (verbose) {
    logger.info(`Starting game client ${n}`);
  }

  const token = process.env.MP_SERVER_AUTH__BYPASS_USER;
  const sync = new SyncClient(wsUrl, () => ({ token }));
  const rpc = createRPCClient(token);

  try {
    await connect(sync);
    if (verbose) {
      logger.info(`Game client ${n} connected`);
    }
    const characterId = await rpc.character.join.mutate();
    if (verbose) {
      logger.info(`Game client ${n} joined as character ${characterId}`);
    }
    await wait(timeout);
    logger.info(`Game client ${n} test finished`);
  } catch (error) {
    if (verbose) {
      logger.error(`Game client ${n} error:`, error);
    }
  } finally {
    sync.stop();
  }
}

function createRPCClient(token?: string) {
  return createTRPCClient<RootRouter>({
    links: [
      httpBatchLink({
        url: apiServerUrl,
        transformer,
        headers: () => ({ [tokenHeaderName]: token }),
      }),
    ],
  });
}

async function connect<State extends object>(sync: SyncClient<State>) {
  await new Promise<void>((resolve, reject) => {
    sync.subscribeToErrors((e) => reject(new Error(e.message)));
    sync.subscribeToReadyState((readyState) => {
      if (readyState === "open") {
        resolve();
      }
    });
    sync.start();
  });
}

function range(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
