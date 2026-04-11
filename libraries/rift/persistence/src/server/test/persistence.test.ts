import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RiftServer, RiftWorld, string, struct, tag, u32 } from "@rift/core";
import { PersistenceId, RiftPersistence, type PersistenceKey } from "../index";

const IsPlayer = tag();
const Profile = struct({ level: u32(), xp: u32() });
const Notes = string();

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

function createDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "rift-persistence-"));
  cleanupPaths.push(dir);
  return join(dir, "game.sqlite");
}

function createServer(): RiftServer {
  const world = new RiftWorld({
    components: [PersistenceId, IsPlayer, Profile, Notes],
  });
  return new RiftServer(world);
}

describe("RiftPersistence", () => {
  it("round-trips owned entities across restarts", () => {
    const dbPath = createDbPath();
    const firstServer = createServer();
    const firstPersistence = new RiftPersistence(firstServer, {
      instanceId: "server-a",
      dbPath,
      collections: {
        players: {
          keyComponent: PersistenceId,
          components: [Profile, Notes],
          queryComponents: [PersistenceId, IsPlayer],
        },
      },
    });

    firstPersistence.start();
    const player = firstServer.spawn();
    player.set(PersistenceId, "player-1" as PersistenceKey);
    player.set(IsPlayer);
    player.set(Profile, { level: 3, xp: 9 });
    player.set(Notes, "persisted");
    firstPersistence.persist();
    firstPersistence.dispose();

    const secondServer = createServer();
    const secondPersistence = new RiftPersistence(secondServer, {
      instanceId: "server-a",
      dbPath,
      collections: {
        players: {
          keyComponent: PersistenceId,
          components: [Profile, Notes],
          queryComponents: [PersistenceId, IsPlayer],
        },
      },
    });

    secondPersistence.start();

    const loaded = secondServer
      .query(PersistenceId, IsPlayer, Profile, Notes)
      .value.find((entity) => entity.get(PersistenceId) === "player-1");

    expect(loaded).toBeDefined();
    expect(loaded?.get(Profile)).toEqual({ level: 3, xp: 9 });
    expect(loaded?.get(Notes)).toBe("persisted");

    secondPersistence.dispose();
  });

  it("syncs external changes between instances", () => {
    const dbPath = createDbPath();
    const ownerServer = createServer();
    const mirrorServer = createServer();
    const ownerPersistence = new RiftPersistence(ownerServer, {
      instanceId: "server-a",
      dbPath,
      collections: {
        players: {
          keyComponent: PersistenceId,
          components: [Profile, Notes],
          queryComponents: [PersistenceId, IsPlayer],
        },
      },
    });
    const mirrorPersistence = new RiftPersistence(mirrorServer, {
      instanceId: "server-b",
      dbPath,
      collections: {
        players: {
          keyComponent: PersistenceId,
          components: [Profile, Notes],
          queryComponents: [PersistenceId, IsPlayer],
        },
      },
    });

    ownerPersistence.start();
    mirrorPersistence.start();

    const player = ownerServer.spawn();
    player.set(PersistenceId, "player-1" as PersistenceKey);
    player.set(IsPlayer);
    player.set(Profile, { level: 1, xp: 1 });
    player.set(Notes, "owner");

    ownerPersistence.persist();
    mirrorPersistence.poll();

    let mirrored = mirrorServer
      .query(PersistenceId, IsPlayer, Profile)
      .value.find((entity) => entity.get(PersistenceId) === "player-1");
    expect(mirrored?.get(Profile)).toEqual({ level: 1, xp: 1 });

    player.get(Profile).xp = 8;
    ownerPersistence.persist();
    mirrorPersistence.poll();

    mirrored = mirrorServer
      .query(PersistenceId, IsPlayer, Profile)
      .value.find((entity) => entity.get(PersistenceId) === "player-1");
    expect(mirrored?.get(Profile)).toEqual({ level: 1, xp: 8 });

    ownerServer.destroy(player);
    ownerPersistence.persist();
    mirrorPersistence.poll();

    mirrored = mirrorServer
      .query(PersistenceId)
      .value.find((entity) => entity.get(PersistenceId) === "player-1");
    expect(mirrored).toBeUndefined();

    ownerPersistence.dispose();
    mirrorPersistence.dispose();
  });

  it("keeps session collections out of the world until activated", () => {
    const dbPath = createDbPath();
    const firstServer = createServer();
    const firstPersistence = new RiftPersistence(firstServer, {
      instanceId: "server-a",
      dbPath,
      collections: {
        players: {
          keyComponent: PersistenceId,
          components: [Profile, Notes],
          queryComponents: [PersistenceId, IsPlayer],
          mode: "session",
        },
      },
    });

    firstPersistence.start();
    const player = firstServer.spawn();
    player.set(PersistenceId, "player-1" as PersistenceKey);
    player.set(IsPlayer);
    player.set(Profile, { level: 3, xp: 9 });
    player.set(Notes, "persisted");
    expect(firstPersistence.activateSessionEntity("players", player)).toBe(
      true,
    );
    firstPersistence.deactivateSessionEntity("players", player);
    firstServer.destroy(player);
    firstPersistence.dispose();

    const secondServer = createServer();
    const secondPersistence = new RiftPersistence(secondServer, {
      instanceId: "server-a",
      dbPath,
      collections: {
        players: {
          keyComponent: PersistenceId,
          components: [Profile, Notes],
          queryComponents: [PersistenceId, IsPlayer],
          mode: "session",
        },
      },
    });

    secondPersistence.start();
    expect(secondServer.query(PersistenceId).value).toHaveLength(0);

    const onlinePlayer = secondServer.spawn();
    onlinePlayer.set(PersistenceId, "player-1" as PersistenceKey);
    onlinePlayer.set(IsPlayer);
    onlinePlayer.set(Profile, { level: 1, xp: 0 });
    onlinePlayer.set(Notes, "new");

    expect(
      secondPersistence.activateSessionEntity("players", onlinePlayer),
    ).toBe(true);
    expect(onlinePlayer.get(Profile)).toEqual({ level: 3, xp: 9 });
    expect(onlinePlayer.get(Notes)).toBe("persisted");

    secondPersistence.dispose();
  });
});
