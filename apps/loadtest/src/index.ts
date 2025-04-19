import { consoleLoggerHandler, Logger } from "@mp/logger";
import { type RootRouter } from "@mp/server";
import { BinaryRpcTransceiver, createRpcProxyInvoker } from "@mp/rpc";
import { createWebSocket } from "@mp/ws/client";
import type { AuthToken } from "@mp/auth";
import { readCliOptions } from "./cli";

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

const { wsUrl, httpServerUrl, httpRequests, gameClients, timeout, verbose } =
  readCliOptions();

const start = performance.now();

await Promise.all([loadTestHttp(), loadTestSocketsWithRpc()]);

const end = performance.now();

logger.info(`Done in ${(end - start).toFixed(2)}ms`);

async function loadTestHttp() {
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

async function loadTestSocketsWithRpc() {
  logger.info("Testing", gameClients, "sockets with Rpc");

  const results = await Promise.allSettled(
    range(gameClients).map(testSocketWithRpc),
  );

  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  logger.info(
    `Socket test finished: ${successes.length} successes, ${failures.length} failures`,
  );
}

async function testSocketWithRpc(n: number) {
  if (verbose) {
    logger.info(`Creating socket ${n}`);
  }

  const socket = createWebSocket(wsUrl);
  const transceiver = new BinaryRpcTransceiver({
    send: socket.send.bind(socket),
  });
  const rpc = createRpcProxyInvoker<RootRouter>(transceiver.call);
  const handleMessage = transceiver.messageEventHandler(logger.error);
  socket.addEventListener("message", handleMessage);

  try {
    await waitForOpen(socket);
    if (verbose) {
      logger.info(`Socket ${n} connected`);
    }
    const characterId = await rpc.character.join(
      process.env.MP_SERVER_AUTH__BYPASS_USER as AuthToken,
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
