import { FeatureRiftClient } from "@rift/feature";
import {
  CharacterList,
  actorListSignal,
  autoRejoinFeature,
  characterListFeature,
  characterSignal,
  fnv1a64,
  isGameReadySignal,
  joinAsPlayer,
  moveCharacter,
  respawnCharacter,
  schemaComponents,
  schemaEvents,
  type AutoRejoinIntent,
  type CharacterId,
} from "@mp/world";
import { wsTransport, type WebSocketLike } from "@rift/ws";
import { signal, type ReadonlySignal } from "@preact/signals-core";
import { createConsoleLogger } from "@mp/logger";
import { createBypassUser } from "@mp/auth";
import { Rng } from "@mp/std";
import { WebSocket } from "ws";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { readCliOptions } from "./cli";

const logger = createConsoleLogger();

const { gameServerUrl, gameClients, timeout, verbose, exitFast } =
  readCliOptions();

async function main() {
  const start = performance.now();
  const success = await testAllGameClients();
  const end = performance.now();
  logger.info(`Done in ${(end - start).toFixed(2)}ms`);
  if (!success) {
    process.exit(1);
  }
}

async function testAllGameClients(): Promise<boolean> {
  logger.info("Testing", gameClients, "game clients...");
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

function testOneGameClient(n: number, rng: Rng): Promise<void> {
  let socket: WebSocket | undefined;
  let stopped = false;
  let stopClient: () => void = () => {};
  return new Promise<void>((resolve, reject) => {
    function failTest(error: unknown) {
      stopped = true;
      reject(error instanceof Error ? error : new Error(String(error)));
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

      const characterIdSignal = signal<CharacterId | undefined>(undefined);
      const intent = (): AutoRejoinIntent | undefined => {
        const id = characterIdSignal.value;
        return id ? { mode: "player", characterId: id } : undefined;
      };

      const characters = new CharacterList();

      const client = new FeatureRiftClient({
        transport: wsTransport(socket as unknown as WebSocketLike),
        hash: fnv1a64,
        features: [
          { components: schemaComponents, events: schemaEvents },
          characterListFeature(characters),
          autoRejoinFeature({ intent }),
        ],
      });

      stopClient = () => void client.disconnect();

      await client.connect();

      const character = characterSignal(client.world, characterIdSignal);
      const ready = isGameReadySignal(character);

      if (verbose) {
        logger.info(`Socket ${n} waiting for character list...`);
      }
      const characterId = await waitUntil(
        characters.characters,
        (list) => list.length > 0,
        15_000,
      ).then((list) => list[0].id);

      characterIdSignal.value = characterId;
      joinAsPlayer(client, characterId);

      if (verbose) {
        logger.info(`Socket ${n} waiting on game ready...`);
      }
      await waitUntil(ready, (v) => v, 15_000);

      const actors = actorListSignal(client.world);
      const endTime = Date.now() + timeout.totalMilliseconds;
      await runUntil(
        endTime,
        () => !stopped,
        () => {
          const ch = character.value;
          if (ch && !ch.combat.health) {
            logger.info(`Character for socket ${n} will respawn`);
            respawnCharacter(client);
          }
          if (ch) {
            const walkable: Vector<Tile>[] = actors.value
              .map((a) => a.movement.coords)
              .filter((v): v is Vector<Tile> => Boolean(v));
            if (walkable.length > 0) {
              const to = rng.oneOf(walkable);
              moveCharacter(client, to);
            }
          }
          return 1000 + rng.next() * 6000;
        },
      );
      if (verbose) {
        logger.info(`Socket ${n} test finished`);
      }
      resolve();
    })().catch(failTest);
  }).finally(() => {
    stopClient();
    socket?.close();
  });
}

async function waitForOpen(socket: WebSocket) {
  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      resolve();
      removeEventListeners();
    };
    const onError = (error: WebSocket.ErrorEvent) => {
      reject(new Error(error.message));
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
  return Array.from({ length: n }, (_, i) => i + 1);
}

function runUntil(
  endMs: number,
  shouldContinue: () => boolean,
  step: () => number,
): Promise<void> {
  return new Promise((resolve) => {
    function tick() {
      if (Date.now() >= endMs || !shouldContinue()) {
        resolve();
        return;
      }
      const delay = step();
      setTimeout(tick, delay);
    }
    tick();
  });
}

function waitUntil<T>(
  signalToWatch: ReadonlySignal<T>,
  isReady: (value: T) => boolean,
  timeout: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (isReady(signalToWatch.value)) {
      resolve(signalToWatch.value);
      return;
    }
    const timeoutId = setTimeout(
      () => reject(new Error("Timeout waiting for signal")),
      timeout,
    );
    const unsubscribe = signalToWatch.subscribe((value) => {
      if (isReady(value)) {
        clearTimeout(timeoutId);
        unsubscribe();
        resolve(value);
      }
    });
  });
}

void main();
