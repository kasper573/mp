// oxlint-disable no-await-in-loop
import { createApiClient } from "@mp/api-service/sdk";
import { createProxyEventInvoker } from "@mp/event-router";
import { GameStateClient } from "@mp/game-client";
import type { GameServerEventRouter } from "@mp/game-service";
import { eventMessageEncoding, loadAreaResource } from "@mp/game-shared";
import type { GatewayRouter } from "@mp/gateway";
import { createConsoleLogger } from "@mp/logger";
import { createBypassUser } from "@mp/oauth";
import type { Signal } from "@mp/state";
import { Rng } from "@mp/std";
import { parseSocketError, WebSocket } from "@mp/ws/server";
import { readCliOptions } from "./cli";

const logger = createConsoleLogger();

const { apiUrl, gameServiceUrl, gameClients, timeout, verbose, exitFast } =
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

  const promises = range(gameClients).map((n) => testOneGameClient(n, rng));

  if (exitFast) {
    try {
      await Promise.all(promises);
      logger.info(`All ${promises.length} game client tests finished`);
      return true;
    } catch (error) {
      logger.error(error, `One or more game client tests failed`);
      return false;
    }
  }

  const results = await Promise.allSettled(promises);
  const successes = results.filter((r) => r.status === "fulfilled");
  const failures = results.filter((r) => r.status === "rejected");

  logger.info(
    `Game client test finished: ${successes.length} successes, ${failures.length} failures`,
  );

  if (verbose) {
    for (let i = 0; i < failures.length; i++) {
      logger.error(failures[i].reason, `Error for game client test ${i + 1}`);
    }
  }

  return failures.length === 0;
}

function testOneGameClient(n: number, rng: Rng) {
  let socket: WebSocket;
  let stopClient = () => {};
  let running = true;
  return new Promise<void>((resolve, __reject) => {
    function failTest(error: unknown) {
      running = false;
      __reject(error);
    }

    void (async () => {
      if (verbose) {
        logger.info(`Creating socket ${n}`);
      }

      const accessToken = createBypassUser(`Load Test ${n}`);
      const url = new URL(gameServiceUrl);
      url.searchParams.set("accessToken", accessToken);
      socket = new WebSocket(url.toString());
      socket.binaryType = "arraybuffer";

      const gameEvents = createProxyEventInvoker<GameServerEventRouter>(
        (message) => socket.send(eventMessageEncoding.encode(message)),
      );

      const gatewayEvents = createProxyEventInvoker<GatewayRouter>((message) =>
        socket.send(eventMessageEncoding.encode(message)),
      );

      await waitForOpen(socket);

      if (verbose) {
        logger.info(`Socket ${n} connected`);
      }

      const gameClient = new GameStateClient({
        socket,
        eventClient: gameEvents,
        logger,
        handlePatchFailure: failTest,
        settings: () => ({
          useInterpolator: false,
          usePatchOptimizer: false,
        }),
      });

      stopClient = gameClient.start();

      if (verbose) {
        logger.info(`Getting character id for socket ${n}`);
      }
      const api = createApiClient(apiUrl, () => accessToken);
      gameClient.characterId.value = await api.myCharacterId.query();

      if (verbose) {
        logger.info(
          `Socket ${n} joining gateway with character ${gameClient.characterId.value}...`,
        );
      }
      gatewayEvents.gateway.join(gameClient.characterId.value);

      if (verbose) {
        logger.info(`Socket ${n} is waiting on area id...`);
      }
      const areaId = await waitUntilDefined(gameClient.areaId);

      if (verbose) {
        logger.info(
          { characterId: gameClient.characterId.value },
          `Socket ${n} successfully joined gateway`,
        );
      }

      const areaUrl = await api.areaFileUrl.query({
        areaId,
        urlType: "public",
      });
      const area = await loadAreaResource(areaId, areaUrl);
      const tiles = Array.from(area.graph.nodeIds)
        .map((nodeId) => area.graph.getNode(nodeId)?.data.vector)
        .filter((v) => v !== undefined);

      const endTime = Date.now() + timeout.totalMilliseconds;
      while (Date.now() < endTime && running) {
        if (
          gameClient.character.value &&
          !gameClient.character.value.combat.health
        ) {
          gameClient.actions.respawn();
        }
        const to = rng.oneOf(tiles);
        gameClient.actions.move(to);
        logger.info(`Moving character for socket ${n} to ${to}`);
        await wait(1000 + rng.next() * 6000);
      }
      if (verbose) {
        logger.info(`Socket ${n} test finished`);
      }
      resolve();
    })().catch(failTest);
  }).finally(() => {
    stopClient();
    socket.close();
  });
}

async function waitForOpen(socket: WebSocket) {
  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      resolve();
      removeEventListeners();
    };
    const onError = (error: WebSocket.ErrorEvent) => {
      reject(parseSocketError(error));
      removeEventListeners();
    };
    function removeEventListeners() {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
    }
    socket.addEventListener("error", onError);
    socket.addEventListener("open", onOpen);
  });
}

function range(n: number) {
  return Array.from({ length: n }, (v, i) => i + 1);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitUntilDefined<T>(signal: Signal<T | undefined>): Promise<T> {
  return new Promise((resolve) => {
    if (signal.value !== undefined) {
      resolve(signal.value);
      return;
    }
    const unsubscribe = signal.subscribe((value) => {
      if (value !== undefined) {
        unsubscribe();
        resolve(value);
      }
    });
  });
}
