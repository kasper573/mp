import { consoleLoggerHandler, Logger } from "@mp/logger";
import { webSocketTokenParam, type RootRouter } from "@mp/server";
import { RPCClient } from "@mp/rpc";
import { EnhancedWebSocket } from "@mp/ws/client";
import { rpcTransformer } from "@mp/game";
import type { AreaId } from "@mp/game";
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
  const rpc = createRPCClient();

  const results = await Promise.allSettled(
    range(rpcRequests).map(() =>
      rpc.area.areaFileUrl.query("forest" as AreaId),
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
  const url = new URL(wsUrl);
  url.searchParams.set(webSocketTokenParam, token);
  const socket = new EnhancedWebSocket();
  const rpc = createRPCClient(token);

  try {
    await connect(socket, url.toString());
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
    socket.stop();
  }
}

function createRPCClient(token?: string) {
  return new RPCClient<RootRouter>({
    url: apiServerUrl,
    transformer: rpcTransformer,
    headers: () => ({
      Authorization: token ? `Bearer ${token}` : undefined,
    }),
  });
}

async function connect(socket: EnhancedWebSocket, url: string) {
  await new Promise<void>((resolve, reject) => {
    socket.subscribeToErrors((e) => reject(new Error(e.message)));
    socket.subscribeToReadyState((readyState) => {
      if (readyState === "open") {
        resolve();
      }
    });
    socket.start(url);
  });
}

function range(n: number) {
  return Array.from({ length: n }, (v, i) => i + 1);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
