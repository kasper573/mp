// oxlint-disable no-await-in-loop
import { RiftClient } from "@rift/core";
import { GameClient, type GameClientSocket } from "@rift/modular";
import { areas, type AreaId } from "@mp/fixtures";
import {
  world,
  modules,
  sessionModule,
  movementModule,
  combatModule,
  loadAreaResource,
  hitTestTiledObject,
  Combat,
  type AreaResource,
} from "@mp/world";
import { createConsoleLogger } from "@mp/logger";
import { createBypassUser } from "@mp/auth";
import type { ReadonlySignal } from "@mp/state";
import { Rng } from "@mp/std";
import { readCliOptions } from "./cli";
import { WebSocket } from "ws";

const logger = createConsoleLogger();

const {
  fileServerUrl,
  gameServerUrl,
  gameClients,
  timeout,
  verbose,
  exitFast,
  behavior,
} = readCliOptions();

let areaResources: Map<AreaId, AreaResource>;

async function main() {
  areaResources = await getAreas();

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
      const url = new URL(gameServerUrl);
      url.searchParams.set("accessToken", accessToken);
      socket = new WebSocket(url.toString());
      socket.binaryType = "arraybuffer";

      await waitForOpen(socket);

      if (verbose) {
        logger.info(`Socket ${n} connected`);
      }

      const rift = new RiftClient(world);
      const client = new GameClient({
        modules,
        rift,
        socket: socket as unknown as GameClientSocket,
      });

      await client.start();
      const session = client.using(sessionModule);
      const movement = client.using(movementModule);
      const combat = client.using(combatModule);

      if (verbose) {
        logger.info(`Socket ${n} waiting for session assignment...`);
      }

      await waitUntil(session.isGameReady, (v) => v, 15_000);

      if (verbose) {
        logger.info(
          `Socket ${n} session assigned, entity: ${session.myEntityId.value}`,
        );
      }

      const endTime = Date.now() + timeout.totalMilliseconds;
      while (Date.now() < endTime && running) {
        const myEntity = session.myEntity.value;
        if (myEntity && myEntity.has(Combat)) {
          if (!myEntity.get(Combat).health) {
            logger.info(`Character for socket ${n} will respawn`);
            combat.respawn();
          }
        }

        const currentAreaId = session.areaId.value;
        const currentArea = currentAreaId
          ? areaResources.get(currentAreaId)
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
              movement.move(to);
              logger.info(
                `Character for socket ${n} will run to ${to} (portal ${portal.object.id})`,
              );
              break;
            }
            case "run": {
              const to = rng.oneOf(tiles(currentArea));
              movement.move(to);
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
      client.dispose();
      resolve();
    })().catch(failTest);
  }).finally(() => {
    socket?.close();
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
      reject(error);
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
  signal: ReadonlySignal<T>,
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
  return new Map(
    await Promise.all(
      areas.map(async (area): Promise<[AreaId, AreaResource]> => {
        const areaFileUrl = `${fileServerUrl}/${area.tiledFile}`;
        return [area.id, await loadAreaResource(area.id, areaFileUrl)];
      }),
    ),
  );
}

void main();
