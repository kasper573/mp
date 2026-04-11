import BetterSqlite3 from "better-sqlite3";
import type { Entity, RiftServer, RiftType } from "@rift/core";
import type { PersistenceSchema } from "../universal/schema";
import { CollectionSync } from "./collection-sync";

type SqliteDatabase = InstanceType<typeof BetterSqlite3>;
type IntervalHandle = ReturnType<typeof setInterval>;

export class RiftPersistence {
  readonly #schema: PersistenceSchema;
  readonly #db: SqliteDatabase;
  readonly #collections: CollectionSync<RiftType<string>>[];
  readonly #collectionsByName: Map<string, CollectionSync<RiftType<string>>>;
  #saveTimer: IntervalHandle | undefined;
  #pollTimer: IntervalHandle | undefined;
  #started = false;

  constructor(rift: RiftServer, schema: PersistenceSchema) {
    this.#schema = schema;
    this.#db = new BetterSqlite3(schema.dbPath);
    this.#collections = Object.entries(schema.collections).map(
      ([collectionName, config]) =>
        new CollectionSync({
          rift,
          db: this.#db,
          collectionName,
          instanceId: schema.instanceId,
          config,
        }),
    );
    this.#collectionsByName = new Map(
      Object.keys(schema.collections).map((name, index) => [
        name,
        this.#collections[index],
      ]),
    );
  }

  start(): void {
    if (this.#started) {
      return;
    }

    this.#configureDb();
    for (const collection of this.#collections) {
      collection.start();
    }

    const saveInterval = this.#schema.saveInterval;
    if (saveInterval !== undefined) {
      this.#saveTimer = setInterval(() => {
        this.persist();
      }, saveInterval);
    }

    const pollInterval = this.#schema.pollInterval ?? 2000;
    this.#pollTimer = setInterval(() => {
      this.poll();
    }, pollInterval);

    this.#started = true;
  }

  persist(): void {
    for (const collection of this.#collections) {
      collection.persist();
    }
  }

  poll(): void {
    for (const collection of this.#collections) {
      collection.poll();
    }
  }

  activateSessionEntity(collectionName: string, entity: Entity): boolean {
    return this.#getCollection(collectionName).activate(entity);
  }

  deactivateSessionEntity(collectionName: string, entity: Entity): void {
    this.#getCollection(collectionName).deactivate(entity);
  }

  dispose(): void {
    if (!this.#started) {
      this.#db.close();
      return;
    }

    this.persist();
    if (this.#saveTimer !== undefined) {
      clearInterval(this.#saveTimer);
      this.#saveTimer = undefined;
    }
    if (this.#pollTimer !== undefined) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = undefined;
    }

    for (const collection of this.#collections) {
      collection.dispose();
    }
    this.#db.close();
    this.#started = false;
  }

  #configureDb(): void {
    this.#db.pragma("foreign_keys = ON");
    if (this.#schema.dbPath !== ":memory:") {
      this.#db.pragma("journal_mode = WAL");
    }
    this.#db.pragma("synchronous = NORMAL");
  }

  #getCollection(collectionName: string): CollectionSync<RiftType<string>> {
    const collection = this.#collectionsByName.get(collectionName);
    if (!collection) {
      throw new Error(`Unknown persistence collection: ${collectionName}`);
    }
    return collection;
  }
}
