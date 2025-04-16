import { consoleLoggerHandler, Logger } from "@mp/logger";
import { type RootRouter } from "@mp/server";
import { BinaryRPCTransmitter, createRPCProxyInvoker } from "@mp/rpc";
import { EnhancedWebSocket } from "@mp/ws/client";
import { readCliOptions } from "./cli";

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

const { wsUrl, httpServerUrl, httpRequests, gameClients, timeout, verbose } =
  readCliOptions();

const start = performance.now();

await Promise.all([loadTestHTTP(), loadTestSocketsWithRPC()]);

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

async function loadTestSocketsWithRPC() {
  logger.info("Testing", gameClients, "sockets with RPC");

  const results = await Promise.allSettled(
    range(gameClients).map(testSocketWithRPC),
  );

  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  logger.info(
    `Socket test finished: ${successes.length} successes, ${failures.length} failures`,
  );
}

async function testSocketWithRPC(n: number) {
  if (verbose) {
    logger.info(`Creating socket ${n}`);
  }

  const token = process.env.MP_SERVER_AUTH__BYPASS_USER!;
  const url = new URL(wsUrl);
  const socket = new EnhancedWebSocket();
  const transmitter = new BinaryRPCTransmitter(socket.send);
  const rpc = createRPCProxyInvoker<RootRouter>(transmitter);
  socket.subscribeToMessage(transmitter.handleMessage);

  try {
    await connect(socket, url.toString());
    if (verbose) {
      logger.info(`Socket ${n} connected`);
    }
    const characterId = await rpc.character.join();
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
    socket.stop();
  }
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
