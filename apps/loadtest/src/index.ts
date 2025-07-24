// oxlint-disable no-await-in-loop
import { createConsoleLogger } from "@mp/logger";
import { createWebSocket } from "@mp/ws/client";
import { createApiClient } from "@mp/api/sdk";
import { createBypassUser } from "@mp/auth";
import { Rng } from "@mp/std";
import type { GameEventClient } from "@mp/game/client";
import {
  GameStateClient,
  loadAreaResource,
  registerEncoderExtensions,
} from "@mp/game/client";
import { readCliOptions } from "./cli";
import type { GameStateEvents } from "@mp/game/server";
import {
  BinaryEventTransceiver,
  createEventRouterProxyInvoker,
} from "@mp/event-router";

registerEncoderExtensions();

const logger = createConsoleLogger();

const { apiUrl, gameServerUrl, gameClients, timeout, verbose } =
  readCliOptions();

const start = performance.now();

const success = await testAllGameClients();

const end = performance.now();

logger.info(`Done in ${(end - start).toFixed(2)}ms`);

if (!success) {
  process.exit(1);
}

async function testAllGameClients() {
  logger.info("Testing", gameClients, "game clients...");

  // Seeded rng to get consistent behavior over time across runs in the ci pipeline
  const rng = new Rng(1337);

  const results = await Promise.allSettled(
    range(gameClients).map((n) => testOneGameClient(n, rng)),
  );

  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  logger.info(
    `Game client test finished: ${successes.length} successes, ${failures.length} failures`,
  );

  return failures.length === 0;
}

async function testOneGameClient(n: number, rng: Rng) {
  if (verbose) {
    logger.info(`Creating socket ${n}`);
  }

  const socket = createWebSocket(gameServerUrl);
  const eventTransceiver = new BinaryEventTransceiver({
    send: (data) => socket.send(data),
  });

  const eventClient: GameEventClient = createEventRouterProxyInvoker(
    (path, input) => eventTransceiver.send([path, input]),
  );

  const handleMessage = eventTransceiver.messageEventHandler(logger.error);
  socket.addEventListener("message", handleMessage);

  let stopClient = () => {};
  try {
    const gameClient = new GameStateClient({
      socket,
      eventClient,
      logger,
      settings: () => ({
        useInterpolator: false,
        usePatchOptimizer: false,
      }),
    });

    const api = createApiClient(apiUrl, () =>
      createBypassUser(`Test User ${n}`),
    );

    stopClient = gameClient.start();

    await waitForOpen(socket);
    if (verbose) {
      logger.info(`Socket ${n} connected`);
    }

    eventClient.world.auth(createBypassUser(`Test User ${n}`));
    if (verbose) {
      logger.info(`Socket ${n} authenticated`);
    }

    const joinPromise = new Promise<GameStateEvents["area.joined"]>(
      (resolve) => {
        const unsub = gameClient.eventBus.subscribe(
          "area.joined",
          (payload) => {
            unsub();
            resolve(payload);
          },
        );
      },
    );

    gameClient.actions.join();

    const { areaId, characterId } = await joinPromise;
    if (verbose) {
      logger.info({ characterId }, `Socket ${n} joined`);
    }

    const url = await api.areaFileUrl.query(areaId);
    const area = await loadAreaResource(areaId, url);
    const tiles = Array.from(area.graph.nodeIds)
      .map((nodeId) => area.graph.getNode(nodeId)?.data.vector)
      .filter((v) => v !== undefined);

    const endTime = Date.now() + timeout.totalMilliseconds;
    while (Date.now() < endTime) {
      if (
        gameClient.character.value &&
        !gameClient.character.value.combat.health
      ) {
        await gameClient.actions.respawn();
      }
      try {
        const to = rng.oneOf(tiles);
        await gameClient.actions.move(to);
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
