import { consoleLoggerHandler, Logger } from "@mp/logger";
import { type ServerRpcRouter } from "@mp/server";
import { BinaryRpcTransceiver, createRpcProxyInvoker } from "@mp/rpc";
import { createWebSocket } from "@mp/ws/client";
import { createBypassUser } from "@mp/auth";
import { Rng } from "@mp/std";
import type { Tile } from "@mp/std";
import { Vector } from "@mp/math";
import { readCliOptions } from "./cli";

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

  if (verbose) {
    for (const result of failures) {
      logger.error(result.reason);
    }
  }

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

    const rng = new Rng();
    const tiles = Array.from(generateTiles(new Vector(44 as Tile, 30 as Tile)));

    const endTime = Date.now() + timeout.totalMilliseconds;
    while (Date.now() < endTime) {
      try {
        // Ty to respawn in case we got killed
        await rpc.character.respawn(characterId);
      } catch {
        // Character is likely alive already
      }

      try {
        const to = rng.oneOf(tiles);
        await rpc.character.move({ characterId, to });
        logger.info("Moving character", characterId, "to", to);
        await wait(1000 + rng.next() * 6000);
      } catch {
        logger.warn("Could not move character", characterId);
        await wait(1000);
      }
    }

    if (verbose) {
      logger.info(`Socket ${n} joined as character ${characterId}`);
    }
    logger.info(`Socket ${n} test finished`);
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

function* generateTiles(areaSize: Vector<Tile>): Generator<Vector<Tile>> {
  for (let x = 0; x < areaSize.x; x++) {
    for (let y = 0; y < areaSize.y; y++) {
      yield new Vector(x as Tile, y as Tile);
    }
  }
}
