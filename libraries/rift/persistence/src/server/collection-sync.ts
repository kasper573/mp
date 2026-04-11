import {
  isTagType,
  type Entity,
  type Infer,
  type RiftServer,
  type RiftType,
} from "@rift/core";
import type BetterSqlite3 from "better-sqlite3";
import type { CollectionConfig } from "../universal/schema";
import { EntityWatcher } from "./entity-watcher";
import {
  createPreparedStatements,
  type CollectionRow,
  type PreparedStatements,
} from "./statements";

function toUint8Array(
  value: Uint8Array | Buffer | null,
): Uint8Array | undefined {
  if (value === null) {
    return undefined;
  }
  return new Uint8Array(value).slice();
}

function setComponentValue<T extends RiftType>(
  entity: Entity,
  type: T,
  value: Infer<T>,
): void {
  entity.set(type, value);
}

export class CollectionSync<TKeyComp extends RiftType<string>> {
  readonly #rift: RiftServer;
  readonly #config: CollectionConfig<TKeyComp>;
  readonly #instanceId: string;
  readonly #queryComponents: ReadonlyArray<RiftType>;
  readonly #watchersByKey = new Map<string, EntityWatcher<TKeyComp>>();
  readonly #watchersByEntity = new Map<Entity, EntityWatcher<TKeyComp>>();
  readonly #mirrorsByKey = new Map<string, Entity>();
  readonly #mirrorKeysByEntity = new Map<Entity, string>();
  readonly #mirrorVersions = new Map<string, number>();
  readonly #pendingMirrorKeys = new Set<string>();
  readonly #deletedKeys = new Set<string>();
  readonly #statements: PreparedStatements;
  readonly #mode;
  readonly #leaseDurationMs;
  #unsubscribeQuery: (() => void) | undefined;
  #unsubscribeQueryValue: (() => void) | undefined;

  constructor(args: {
    rift: RiftServer;
    db: InstanceType<typeof BetterSqlite3>;
    collectionName: string;
    instanceId: string;
    config: CollectionConfig<TKeyComp>;
  }) {
    this.#rift = args.rift;
    this.#config = args.config;
    this.#instanceId = args.instanceId;
    this.#mode = args.config.mode ?? "world";
    this.#leaseDurationMs = args.config.leaseDurationMs ?? 10_000;
    this.#queryComponents = args.config.queryComponents ?? [
      args.config.keyComponent,
      ...args.config.components,
    ];
    this.#statements = createPreparedStatements(
      args.db,
      args.collectionName,
      args.config.components.length,
    );
  }

  start(): void {
    this.#statements.createTable();
    if (this.#mode === "session") {
      this.#statements.createLeaseTable();
      return;
    }

    this.loadOwned();

    const query = this.#rift.query(...this.#queryComponents);
    this.#unsubscribeQuery = query.onChange((event) => {
      if (event.type === "added") {
        this.#handleAdded(event.entity);
        return;
      }
      this.#handleRemoved(event.entity);
    });
    this.#unsubscribeQueryValue = query.subscribe(() => {});
    this.poll();
  }

  loadOwned(): void {
    if (this.#mode === "session") {
      return;
    }
    const existing = this.#indexEntitiesByKey();
    for (const row of this.#statements.loadOwned(this.#instanceId)) {
      if (row._deleted !== 0) {
        continue;
      }

      const entity = existing.get(row.key) ?? this.#rift.spawn();
      this.#hydrateEntity(entity, row);
    }
  }

  persist(): void {
    if (this.#mode === "session") {
      this.#renewSessionLeases();
    }

    for (const key of this.#deletedKeys) {
      this.#statements.softDelete(key, this.#instanceId);
    }
    this.#deletedKeys.clear();

    for (const watcher of this.#watchersByKey.values()) {
      const diff = watcher.diff();
      if (!diff.changed) {
        watcher.commit(diff.blobs);
        continue;
      }
      this.#statements.upsert({
        key: watcher.key,
        instance_id: this.#instanceId,
        blobs: diff.blobs,
      });
      watcher.commit(diff.blobs);
    }
  }

  poll(): void {
    if (this.#mode === "session") {
      this.#renewSessionLeases();
      return;
    }

    for (const row of this.#statements.loadExternal(this.#instanceId)) {
      const previousVersion = this.#mirrorVersions.get(row.key);
      if (previousVersion !== undefined && row._version <= previousVersion) {
        continue;
      }
      if (this.#watchersByKey.has(row.key)) {
        continue;
      }

      if (row._deleted !== 0) {
        const entity = this.#mirrorsByKey.get(row.key);
        if (entity) {
          this.#mirrorsByKey.delete(row.key);
          this.#mirrorKeysByEntity.delete(entity);
          this.#mirrorVersions.delete(row.key);
          this.#rift.destroy(entity);
        }
        continue;
      }

      const mirror = this.#mirrorsByKey.get(row.key);
      if (mirror) {
        this.#hydrateEntity(mirror, row);
      } else {
        this.#pendingMirrorKeys.add(row.key);
        const entity = this.#rift.spawn();
        this.#hydrateEntity(entity, row);
        this.#pendingMirrorKeys.delete(row.key);
        this.#mirrorsByKey.set(row.key, entity);
        this.#mirrorKeysByEntity.set(entity, row.key);
      }

      this.#mirrorVersions.set(row.key, row._version);
    }
  }

  dispose(): void {
    this.#unsubscribeQuery?.();
    this.#unsubscribeQueryValue?.();
    this.#unsubscribeQuery = undefined;
    this.#unsubscribeQueryValue = undefined;

    for (const watcher of this.#watchersByKey.values()) {
      if (this.#mode === "session") {
        this.#statements.releaseLease(watcher.key, this.#instanceId);
      }
      watcher.dispose();
    }
    this.#watchersByKey.clear();
    this.#watchersByEntity.clear();
    this.#mirrorsByKey.clear();
    this.#mirrorKeysByEntity.clear();
    this.#mirrorVersions.clear();
    this.#pendingMirrorKeys.clear();
    this.#deletedKeys.clear();
  }

  activate(entity: Entity): boolean {
    if (this.#mode !== "session") {
      throw new Error("activate() is only supported for session collections");
    }
    if (!entity.has(this.#config.keyComponent)) {
      throw new Error(
        "Session entity must have its key component before activation",
      );
    }

    const key = entity.get(this.#config.keyComponent);
    if (!this.#acquireLease(key)) {
      return false;
    }

    const row = this.#statements.loadByKey(key);
    if (row && row._deleted === 0) {
      this.#hydrateEntity(entity, row);
    }

    this.#attachWatcher(entity);
    return true;
  }

  deactivate(entity: Entity): void {
    if (this.#mode !== "session") {
      throw new Error("deactivate() is only supported for session collections");
    }

    const watcher = this.#watchersByEntity.get(entity);
    if (!watcher) {
      return;
    }

    this.#persistWatcher(watcher);
    this.#watchersByEntity.delete(entity);
    this.#watchersByKey.delete(watcher.key);
    this.#deletedKeys.delete(watcher.key);
    this.#statements.releaseLease(watcher.key, this.#instanceId);
    watcher.dispose();
  }

  #handleAdded(entity: Entity): void {
    if (this.#mode === "session") {
      return;
    }
    if (!entity.has(this.#config.keyComponent)) {
      return;
    }
    this.#attachWatcher(entity);
  }

  #handleRemoved(entity: Entity): void {
    if (this.#mode === "session") {
      return;
    }
    const mirrorKey = this.#mirrorKeysByEntity.get(entity);
    if (mirrorKey) {
      this.#mirrorKeysByEntity.delete(entity);
      this.#mirrorsByKey.delete(mirrorKey);
      this.#mirrorVersions.delete(mirrorKey);
      return;
    }

    const watcher = this.#watchersByEntity.get(entity);
    if (!watcher) {
      return;
    }

    this.#watchersByEntity.delete(entity);
    this.#watchersByKey.delete(watcher.key);
    this.#deletedKeys.add(watcher.key);
    watcher.dispose();
  }

  #indexEntitiesByKey(): Map<string, Entity> {
    const indexed = new Map<string, Entity>();
    for (const entity of this.#rift.query(this.#config.keyComponent).value) {
      const key = entity.get(this.#config.keyComponent);
      indexed.set(key, entity);
    }
    return indexed;
  }

  #hydrateEntity(entity: Entity, row: CollectionRow): void {
    if (!entity.has(this.#config.keyComponent)) {
      // SQLite stores branded string keys as plain TEXT, so hydration must reattach the compile-time brand.
      setComponentValue(
        entity,
        this.#config.keyComponent,
        row.key as Infer<TKeyComp>,
      );
    }

    for (const type of this.#queryComponents) {
      if (
        type !== this.#config.keyComponent &&
        isTagType(type) &&
        !entity.has(type)
      ) {
        entity.set(type);
      }
    }

    for (const [index, type] of this.#config.components.entries()) {
      const blob = toUint8Array(row[`comp_${index}`]);
      if (blob === undefined) {
        if (entity.has(type)) {
          entity.remove(type);
        }
        continue;
      }

      if (isTagType(type)) {
        if (!entity.has(type)) {
          entity.set(type);
        }
        continue;
      }

      const decoded = type.decode(blob);
      if (!entity.has(type)) {
        setComponentValue(entity, type, decoded);
        continue;
      }

      const current = entity.get(type);
      if (!type.equals(current, decoded)) {
        setComponentValue(entity, type, decoded);
      }
    }
  }

  #attachWatcher(entity: Entity): void {
    const key = entity.get(this.#config.keyComponent);
    if (
      this.#pendingMirrorKeys.has(key) ||
      this.#mirrorsByKey.get(key) === entity
    ) {
      return;
    }

    const existing = this.#watchersByKey.get(key);
    if (existing) {
      if (existing.entity !== entity) {
        throw new Error(`Duplicate persisted entity key: ${key}`);
      }
      return;
    }

    const watcher = new EntityWatcher(
      entity,
      this.#config.keyComponent,
      this.#config.components,
    );
    this.#watchersByKey.set(key, watcher);
    this.#watchersByEntity.set(entity, watcher);
    this.#deletedKeys.delete(key);
  }

  #persistWatcher(watcher: EntityWatcher<TKeyComp>): void {
    const diff = watcher.diff();
    if (!diff.changed) {
      watcher.commit(diff.blobs);
      return;
    }
    this.#statements.upsert({
      key: watcher.key,
      instance_id: this.#instanceId,
      blobs: diff.blobs,
    });
    watcher.commit(diff.blobs);
  }

  #renewSessionLeases(): void {
    if (this.#mode !== "session") {
      return;
    }
    const expiresAt = Date.now() + this.#leaseDurationMs;
    for (const watcher of this.#watchersByKey.values()) {
      this.#statements.renewLease(watcher.key, this.#instanceId, expiresAt);
    }
  }

  #acquireLease(key: string): boolean {
    return this.#statements.acquireLease(
      key,
      this.#instanceId,
      Date.now() + this.#leaseDurationMs,
      Date.now(),
    );
  }
}
