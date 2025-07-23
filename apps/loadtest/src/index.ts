// oxlint-disable no-await-in-loop
import { createConsoleLogger } from "@mp/logger";
import type { ApiRpcRouter } from "@mp/api";
import { BinaryRpcTransceiver } from "@mp/rpc";
import { createWebSocket } from "@mp/ws/client";
import { createBypassUser } from "@mp/auth";
import { Rng } from "@mp/std";
import {
  GameStateClient,
  loadAreaResource,
  registerEncoderExtensions,
} from "@mp/game/client";
import { createReactRpcInvoker } from "@mp/rpc/react";
import { readCliOptions } from "./cli";

registerEncoderExtensions();

const logger = createConsoleLogger();

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

  // Seeded rng to get consistent behavior over time across runs in the ci pipeline
  const rng = new Rng(1337);

  const results = await Promise.allSettled(
    range(gameClients).map((n) => testOneGameClient(n, rng)),
  );

  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  logger.info(
    `Socket test finished: ${successes.length} successes, ${failures.length} failures`,
  );

  return failures.length === 0;
}

async function testOneGameClient(n: number, rng: Rng) {
  if (verbose) {
    logger.info(`Creating socket ${n}`);
  }

  const socket = createWebSocket(wsUrl);
  const transceiver = new BinaryRpcTransceiver<void>({
    send: socket.send.bind(socket),
  });
  const rpc = createReactRpcInvoker<ApiRpcRouter>(transceiver.call);
  const handleMessage = transceiver.messageEventHandler(logger.error);
  socket.addEventListener("message", handleMessage);

  let stopClient = () => {};
  try {
    const client = new GameStateClient({
      socket,
      rpc,
      logger,
      settings: () => ({
        useInterpolator: false,
        usePatchOptimizer: false,
      }),
    });

    stopClient = client.start();

    await waitForOpen(socket);
    if (verbose) {
      logger.info(`Socket ${n} connected`);
    }

    await rpc.world.auth(createBypassUser(`Test User ${n}`));
    if (verbose) {
      logger.info(`Socket ${n} authenticated`);
    }

    const { areaId, id: characterId } = await client.actions.join();
    if (verbose) {
      logger.info({ characterId }, `Socket ${n} joined`);
    }

    const url = await rpc.area.areaFileUrl(areaId);
    const area = await loadAreaResource(url, areaId);
    const tiles = Array.from(area.graph.nodeIds)
      .map((nodeId) => area.graph.getNode(nodeId)?.data.vector)
      .filter((v) => v !== undefined);

    const endTime = Date.now() + timeout.totalMilliseconds;
    while (Date.now() < endTime) {
      if (client.character.value && !client.character.value.health) {
        await client.actions.respawn();
      }
      try {
        const to = rng.oneOf(tiles);
        await rpc.character.move({ characterId, to });
        logger.info(`Moving character for socket ${n} to ${to}`);
        await wait(1000 + rng.next() * 6000);
      } catch (error) {
        logger.error(error, `Could not move character for socket ${n}`);
        await wait(1000);
      }
    }
    if (verbose) {
      logger.info(`Socket ${n} test finished`);
    }
  } catch (error) {
    if (verbose) {
      logger.error(error, `Socket ${n} error`);
    }
    throw error;
  } finally {
    stopClient();
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
