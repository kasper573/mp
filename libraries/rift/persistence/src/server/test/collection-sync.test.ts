import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import BetterSqlite3 from "better-sqlite3";
import { RiftServer, RiftWorld, string, struct, tag, u32 } from "@rift/core";
import { CollectionSync, PersistenceId, type PersistenceKey } from "../index";

const IsPlayer = tag();
const Profile = struct({ level: u32(), xp: u32() });
const Notes = string();

function createDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "rift-persistence-"));
  pathsToClean.push(dir);
  return join(dir, "test.sqlite");
}

const pathsToClean: string[] = [];

afterEach(() => {
  while (pathsToClean.length > 0) {
    const path = pathsToClean.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

function makeServer(): RiftServer {
  const world = new RiftWorld({
    components: [PersistenceId, IsPlayer, Profile, Notes],
  });
  return new RiftServer(world);
}

describe("CollectionSync", () => {
  it("loads owned rows into existing keyed entities", () => {
    const dbPath = createDbPath();
    const seedDb = new BetterSqlite3(dbPath);
    seedDb
      .prepare(
        `CREATE TABLE players (
          key TEXT PRIMARY KEY,
          instance_id TEXT NOT NULL,
          _version INTEGER NOT NULL DEFAULT 0,
          _deleted INTEGER NOT NULL DEFAULT 0,
          comp_0 BLOB,
          comp_1 BLOB
        )`,
      )
      .run();
    seedDb
      .prepare(
        `INSERT INTO players (key, instance_id, _version, _deleted, comp_0, comp_1)
         VALUES (?, ?, 1, 0, ?, ?)`,
      )
      .run(
        "player-1",
        "server-a",
        Profile.encode({ level: 5, xp: 12 }),
        Notes.encode("seeded"),
      );
    seedDb.close();

    const rift = makeServer();
    const existing = rift.spawn();
    existing.set(PersistenceId, "player-1" as PersistenceKey);
    existing.set(IsPlayer);

    const db = new BetterSqlite3(dbPath);
    const sync = new CollectionSync({
      rift,
      db,
      collectionName: "players",
      instanceId: "server-a",
      config: {
        keyComponent: PersistenceId,
        components: [Profile, Notes],
        queryComponents: [PersistenceId, IsPlayer],
      },
    });

    sync.loadOwned();

    expect(existing.get(Profile)).toEqual({ level: 5, xp: 12 });
    expect(existing.get(Notes)).toBe("seeded");
    sync.dispose();
    db.close();
  });

  it("persists dirty entities and soft deletes removed ones", () => {
    const dbPath = createDbPath();
    const rift = makeServer();
    const db = new BetterSqlite3(dbPath);
    const sync = new CollectionSync({
      rift,
      db,
      collectionName: "players",
      instanceId: "server-a",
      config: {
        keyComponent: PersistenceId,
        components: [Profile, Notes],
        queryComponents: [PersistenceId, IsPlayer],
      },
    });

    sync.start();

    const entity = rift.spawn();
    entity.set(PersistenceId, "player-1" as PersistenceKey);
    entity.set(IsPlayer);
    entity.set(Profile, { level: 1, xp: 2 });
    entity.set(Notes, "hello");

    sync.persist();

    const persistedRow = db
      .prepare("SELECT * FROM players WHERE key = ?")
      .get("player-1") as {
      _deleted: number;
      comp_0: Uint8Array;
    };
    expect(persistedRow._deleted).toBe(0);
    expect(Profile.decode(new Uint8Array(persistedRow.comp_0))).toEqual({
      level: 1,
      xp: 2,
    });

    rift.destroy(entity);
    sync.persist();

    const deletedRow = db
      .prepare("SELECT * FROM players WHERE key = ?")
      .get("player-1") as {
      _deleted: number;
    };
    expect(deletedRow._deleted).toBe(1);

    sync.dispose();
    db.close();
  });

  it("hydrates and updates mirror entities from external rows", () => {
    const dbPath = createDbPath();
    const ownerDb = new BetterSqlite3(dbPath);
    const mirrorDb = new BetterSqlite3(dbPath);
    const owner = makeServer();
    const mirror = makeServer();

    const ownerSync = new CollectionSync({
      rift: owner,
      db: ownerDb,
      collectionName: "players",
      instanceId: "server-a",
      config: {
        keyComponent: PersistenceId,
        components: [Profile, Notes],
        queryComponents: [PersistenceId, IsPlayer],
      },
    });
    const mirrorSync = new CollectionSync({
      rift: mirror,
      db: mirrorDb,
      collectionName: "players",
      instanceId: "server-b",
      config: {
        keyComponent: PersistenceId,
        components: [Profile, Notes],
        queryComponents: [PersistenceId, IsPlayer],
      },
    });

    ownerSync.start();
    mirrorSync.start();

    const entity = owner.spawn();
    entity.set(PersistenceId, "player-1" as PersistenceKey);
    entity.set(IsPlayer);
    entity.set(Profile, { level: 1, xp: 2 });
    entity.set(Notes, "hello");
    ownerSync.persist();
    mirrorSync.poll();

    let mirrored = mirror
      .query(PersistenceId, IsPlayer, Profile)
      .value.find((candidate) => candidate.get(PersistenceId) === "player-1");
    expect(mirrored).toBeDefined();
    expect(mirrored?.get(Profile)).toEqual({ level: 1, xp: 2 });

    entity.get(Profile).xp = 20;
    ownerSync.persist();
    mirrorSync.poll();

    mirrored = mirror
      .query(PersistenceId, IsPlayer, Profile)
      .value.find((candidate) => candidate.get(PersistenceId) === "player-1");
    expect(mirrored?.get(Profile)).toEqual({ level: 1, xp: 20 });

    owner.destroy(entity);
    ownerSync.persist();
    mirrorSync.poll();

    mirrored = mirror
      .query(PersistenceId)
      .value.find((candidate) => candidate.get(PersistenceId) === "player-1");
    expect(mirrored).toBeUndefined();

    ownerSync.dispose();
    mirrorSync.dispose();
    ownerDb.close();
    mirrorDb.close();
  });

  it("does not auto-load session rows until explicitly activated", () => {
    const dbPath = createDbPath();
    const seedDb = new BetterSqlite3(dbPath);
    seedDb
      .prepare(
        `CREATE TABLE players (
          key TEXT PRIMARY KEY,
          instance_id TEXT NOT NULL,
          _version INTEGER NOT NULL DEFAULT 0,
          _deleted INTEGER NOT NULL DEFAULT 0,
          comp_0 BLOB,
          comp_1 BLOB
        )`,
      )
      .run();
    seedDb
      .prepare(
        `INSERT INTO players (key, instance_id, _version, _deleted, comp_0, comp_1)
         VALUES (?, ?, 1, 0, ?, ?)`,
      )
      .run(
        "player-1",
        "server-a",
        Profile.encode({ level: 7, xp: 21 }),
        Notes.encode("offline"),
      );
    seedDb.close();

    const rift = makeServer();
    const db = new BetterSqlite3(dbPath);
    const sync = new CollectionSync({
      rift,
      db,
      collectionName: "players",
      instanceId: "server-a",
      config: {
        keyComponent: PersistenceId,
        components: [Profile, Notes],
        queryComponents: [PersistenceId, IsPlayer],
        mode: "session",
      },
    });

    sync.start();
    expect(rift.query(PersistenceId).value).toHaveLength(0);

    const entity = rift.spawn();
    entity.set(PersistenceId, "player-1" as PersistenceKey);
    entity.set(IsPlayer);
    entity.set(Profile, { level: 1, xp: 0 });
    entity.set(Notes, "online");

    expect(sync.activate(entity)).toBe(true);
    expect(entity.get(Profile)).toEqual({ level: 7, xp: 21 });
    expect(entity.get(Notes)).toBe("offline");

    sync.deactivate(entity);
    rift.destroy(entity);
    expect(rift.query(PersistenceId).value).toHaveLength(0);

    sync.dispose();
    db.close();
  });

  it("prevents two instances from activating the same session key", () => {
    const dbPath = createDbPath();
    const firstDb = new BetterSqlite3(dbPath);
    const secondDb = new BetterSqlite3(dbPath);
    const firstServer = makeServer();
    const secondServer = makeServer();

    const firstSync = new CollectionSync({
      rift: firstServer,
      db: firstDb,
      collectionName: "players",
      instanceId: "server-a",
      config: {
        keyComponent: PersistenceId,
        components: [Profile, Notes],
        queryComponents: [PersistenceId, IsPlayer],
        mode: "session",
      },
    });
    const secondSync = new CollectionSync({
      rift: secondServer,
      db: secondDb,
      collectionName: "players",
      instanceId: "server-b",
      config: {
        keyComponent: PersistenceId,
        components: [Profile, Notes],
        queryComponents: [PersistenceId, IsPlayer],
        mode: "session",
      },
    });

    firstSync.start();
    secondSync.start();

    const firstEntity = firstServer.spawn();
    firstEntity.set(PersistenceId, "player-1" as PersistenceKey);
    firstEntity.set(IsPlayer);
    firstEntity.set(Profile, { level: 1, xp: 1 });
    firstEntity.set(Notes, "first");

    const secondEntity = secondServer.spawn();
    secondEntity.set(PersistenceId, "player-1" as PersistenceKey);
    secondEntity.set(IsPlayer);
    secondEntity.set(Profile, { level: 2, xp: 2 });
    secondEntity.set(Notes, "second");

    expect(firstSync.activate(firstEntity)).toBe(true);
    expect(secondSync.activate(secondEntity)).toBe(false);

    firstSync.deactivate(firstEntity);
    expect(secondSync.activate(secondEntity)).toBe(true);

    firstSync.dispose();
    secondSync.dispose();
    firstDb.close();
    secondDb.close();
  });
});
