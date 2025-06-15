import { consoleLoggerHandler, Logger } from "@mp/logger";
import { type ServerRpcRouter } from "@mp/server";
import { BinaryRpcTransceiver } from "@mp/rpc";
import { createWebSocket } from "@mp/ws/client";
import { createBypassUser } from "@mp/auth";
import { Rng } from "@mp/std";
import {
  createGameActions,
  createGameStateClient,
  loadAreaResource,
  registerEncoderExtensions,
} from "@mp/game/client";
import { createSolidRpcInvoker } from "@mp/rpc/solid";
import { readCliOptions } from "./cli";

registerEncoderExtensions();

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

const { wsUrl, httpServerUrl, httpRequests, gameClients, timeout, verbose } =
  readCliOptions();

const start = performance.now();

const [httpSuccess, gameClientSuccess] = await Promise.all([
  testAllHttpRequests(),
  testAllGameClients(),
]);

const end = performance.now();

logger.info(`Done in ${(end - start).toFixed(2)}ms`);

if (!httpSuccess || !gameClientSuccess) {
  logger.error("HTTP request test failed");
  process.exit(1);
}

async function testAllHttpRequests() {
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

  return failures.length === 0;
}

async function testAllGameClients() {
  logger.info("Testing", gameClients, "sockets with Rpc");

  const results = await Promise.allSettled(
    range(gameClients).map(testOneGameClient),
  );

  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  logger.info(
    `Socket test finished: ${successes.length} successes, ${failures.length} failures`,
  );

  return failures.length === 0;
}

async function testOneGameClient(n: number) {
  if (verbose) {
    logger.info(`Creating socket ${n}`);
  }

  const socket = createWebSocket(wsUrl);
  const transceiver = new BinaryRpcTransceiver({
    send: socket.send.bind(socket),
  });
  const rpc = createSolidRpcInvoker<ServerRpcRouter>(transceiver.call);
  const handleMessage = transceiver.messageEventHandler(logger.error);
  socket.addEventListener("message", handleMessage);

  try {
    await waitForOpen(socket);
    if (verbose) {
      logger.info(`Socket ${n} connected`);
    }

    // Seeded rng to get consistent behavior over time across runs in the ci pipeline
    const rng = new Rng(1337);

    const gameState = createGameStateClient(rpc, socket, logger, () => ({
      useInterpolator: false,
      usePatchOptimizer: false,
    }));

    const gameActions = createGameActions(rpc, gameState);

    await gameActions.join(createBypassUser(`Test User ${n}`));

    if (verbose) {
      logger.info(`Waiting for areaId for socket ${n}`);
    }
    const areaId = await waitFor(() => gameState.areaId());

    const url = await rpc.area.areaFileUrl(areaId);
    const serverVersion = await rpc.system.buildVersion();
    const area = await loadAreaResource(url, areaId, serverVersion);
    const tiles = Array.from(area.graph.getNodes()).map(
      (node) => node.data.vector,
    );

    const endTime = Date.now() + timeout.totalMilliseconds;
    while (Date.now() < endTime) {
      try {
        // Ty to respawn in case we got killed
        await gameActions.respawn();
      } catch {
        // Character is likely alive already
      }

      try {
        const to = rng.oneOf(tiles);
        await gameActions.move(to);
        logger.info("Moving character for socket", n, "to", to);
        await wait(1000 + rng.next() * 6000);
      } catch {
        logger.warn("Could not move character for socket", n);
        await wait(1000);
      }
    }
    if (verbose) {
      logger.info(`Socket ${n} test finished`);
    }
  } catch (error) {
    if (verbose) {
      logger.error(`Socket ${n} error:`, error);
    }
    throw error;
  } finally {
    socket.close();
    socket.removeEventListener("message", handleMessage);
  }
}

async function waitForOpen(socket: WebSocket) {
  await new Promise<Event>((resolve, reject) => {
    socket.addEventListener("error", (cause) =>
      reject(new Error("Socket error", { cause })),
    );
    socket.addEventListener("open", resolve);
  });
}

function range(n: number) {
  return Array.from({ length: n }, (v, i) => i + 1);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitFor<T>(
  predicate: () => T | undefined,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const result = predicate();
      if (result !== undefined) {
        clearInterval(interval);
        resolve(result);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error("Timeout waiting for condition"));
      }
    }, 100);
  });
}
