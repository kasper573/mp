// oxlint-disable no-await-in-loop
import fs from "fs/promises";
import { graphql, GraphQLClient } from "@mp/api-service/client";
import { createProxyEventInvoker } from "@mp/event-router";
import { browserLoadAreaResource, GameStateClient } from "@mp/game-client";
import type { GameServerEventRouter } from "@mp/game-service";
import type { AreaId, AreaResource } from "@mp/game-shared";
import { eventMessageEncoding, hitTestTiledObject } from "@mp/game-shared";
import type { GatewayRouter } from "@mp/gateway";
import { createConsoleLogger } from "@mp/logger";
import { createBypassUser } from "@mp/auth";
import type { Signal } from "@mp/state";
import { Rng, toResult } from "@mp/std";
import { parseSocketError, WebSocket } from "@mp/ws/server";
import { readCliOptions } from "./cli";
import apiSchema from "@mp/api-service/client/schema.json";
import path from "path";

const logger = createConsoleLogger();

const {
  apiUrl,
  gameServiceUrl,
  gameClients,
  timeout,
  verbose,
  exitFast,
  behavior,
} = readCliOptions();

let areas: Map<AreaId, AreaResource>;

async function main() {
  areas = await getAreas();

  const start = performance.now();

  const success = await testAllGameClients();

  const end = performance.now();

  logger.info(`Done in ${(end - start).toFixed(2)}ms`);

  if (!success) {
    process.exit(1);
  }
}

function determineBehavior(n: number) {
  switch (behavior) {
    case "alternate":
      return n % 2 === 0 ? "run" : "portal";
    default:
      return behavior;
  }
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
      const api = createApiClient(accessToken);
      const { myCharacterId } = toResult(
        await api.query({ query: myCharacterIdQuery }),
      )._unsafeUnwrap();
      gameClient.characterId.value = myCharacterId;

      if (verbose) {
        logger.info(
          `Socket ${n} joining gateway with character ${gameClient.characterId.value}...`,
        );
      }
      gatewayEvents.gateway.join(gameClient.characterId.value);

      if (verbose) {
        logger.info(`Socket ${n} is waiting on area id...`);
      }

      await waitUntil(gameClient.isGameReady, (v) => v, 15_000);

      if (verbose) {
        logger.info(
          { characterId: gameClient.characterId.value },
          `Socket ${n} successfully joined gateway`,
        );
      }

      const endTime = Date.now() + timeout.totalMilliseconds;
      while (Date.now() < endTime && running) {
        if (
          gameClient.character.value &&
          !gameClient.character.value.combat.health
        ) {
          logger.info(`Character for socket ${n} will respawn`);
          gameClient.actions.respawn();
        }

        const currentArea = gameClient.areaId.value
          ? areas.get(gameClient.areaId.value)
          : undefined;

        if (currentArea) {
          switch (determineBehavior(n)) {
            case "portal": {
              const portal = rng.oneOf(currentArea.portals);
              const portalWalkableTiles = tiles(currentArea).filter((coord) =>
                hitTestTiledObject(
                  portal.object,
                  currentArea.tiled.tileCoordToWorld(coord),
                ),
              );
              const to = rng.oneOf(portalWalkableTiles);
              gameClient.actions.move(to, portal.object.id);
              logger.info(
                `Character for socket ${n} will run to ${to} (portal ${portal.object.id})`,
              );
              break;
            }
            case "run": {
              const to = rng.oneOf(tiles(currentArea));
              gameClient.actions.move(to);
              logger.info(`Character for socket ${n} will run to ${to}`);
              break;
            }
            default:
              logger.info(
                `Unknown behavior "${determineBehavior(n)}" for socket ${n}, idling..`,
              );
              break;
          }
        } else {
          logger.warn(`Socket ${n} has no area loaded, idling..`);
        }
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

function tiles(area: AreaResource) {
  return Array.from(area.graph.nodeIds)
    .map((nodeId) => area.graph.getNode(nodeId)?.data.vector)
    .filter((v) => v !== undefined);
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

function waitUntil<T>(
  signal: Signal<T>,
  isReady: (value: T) => boolean,
  timeout: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.value !== undefined) {
      resolve(signal.value);
      return;
    }
    const timeoutId = setTimeout(
      () => reject(new Error("Timeout waiting for defined signal")),
      timeout,
    );
    const unsubscribe = signal.subscribe((value) => {
      if (isReady(value)) {
        clearTimeout(timeoutId);
        unsubscribe();
        resolve(value);
      }
    });
  });
}

async function getAreas(): Promise<Map<AreaId, AreaResource>> {
  const areaFiles = await fs.readdir(
    path.resolve(__dirname, "../../../docker/file-server/public/areas"),
    { withFileTypes: true },
  );
  const api = createApiClient(createBypassUser("load test script"));
  return new Map(
    await Promise.all(
      areaFiles
        .filter((entry) => entry.isFile())
        .map(async (entry): Promise<[AreaId, AreaResource]> => {
          const areaId = path.basename(
            entry.name,
            path.extname(entry.name),
          ) as AreaId;
          const { areaFileUrl } = toResult(
            await api.query({ query: areaFileQuery, variables: { areaId } }),
          )._unsafeUnwrap();

          return [areaId, await browserLoadAreaResource(areaId, areaFileUrl)];
        }),
    ),
  );
}

function createApiClient(accessToken: string) {
  return new GraphQLClient({
    serverUrl: apiUrl,
    schema: apiSchema,
    fetchOptions: (init) => ({
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
    }),
  });
}

const areaFileQuery = graphql(`
  query GetAreaFileUrl($areaId: AreaId!) {
    areaFileUrl(areaId: $areaId, urlType: public)
  }
`);

const myCharacterIdQuery = graphql(`
  query GetMyCharacterId {
    myCharacterId
  }
`);

void main();
