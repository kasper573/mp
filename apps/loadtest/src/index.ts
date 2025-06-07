import { consoleLoggerHandler, Logger } from "@mp/logger";
import { type ServerRpcRouter } from "@mp/server";
import { BinaryRpcTransceiver, createRpcProxyInvoker } from "@mp/rpc";
import { createWebSocket } from "@mp/ws/client";
import { createBypassUser } from "@mp/auth";
import { readCliOptions } from "./cli";

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

const { wsUrl, httpServerUrl, httpRequests, gameClients, timeout, verbose } =
  readCliOptions();

const start = performance.now();

await Promise.all([testAllHttpRequests(), testAllGameClients()]);

const end = performance.now();

logger.info(`Done in ${(end - start).toFixed(2)}ms`);

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

  if (verbose) {
    for (const result of failures) {
      logger.error(result.reason);
    }
  }
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
}

async function testOneGameClient(n: number) {
  if (verbose) {
    logger.info(`Creating socket ${n}`);
  }

  const socket = createWebSocket(wsUrl);
  const transceiver = new BinaryRpcTransceiver({
    send: socket.send.bind(socket),
  });
  const rpc = createRpcProxyInvoker<ServerRpcRouter>(transceiver.call);
  const handleMessage = transceiver.messageEventHandler(logger.error);
  socket.addEventListener("message", handleMessage);

  try {
    await waitForOpen(socket);
    if (verbose) {
      logger.info(`Socket ${n} connected`);
    }
    const characterId = await rpc.world.join(
      createBypassUser(`Test User ${n}`),
    );
    if (verbose) {
      logger.info(`Socket ${n} joined as character ${characterId}`);
    }
    await wait(timeout);
    logger.info(`Socket ${n} test finished`);
  } catch (error) {
    if (verbose) {
      logger.error(`Socket ${n} error:`, error);
    }
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
