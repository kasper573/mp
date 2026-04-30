import type { Cleanup } from "@rift/module";
import type { ClientId, EntityId, RiftServerEvent, World } from "@rift/core";
import {
  ClientConnected,
  ClientDisconnected,
  RiftServerModule,
} from "@rift/core";
import { inject } from "@rift/module";
import {
  AreaTag,
  CharacterTag,
  ClientCharacterRegistry,
  Combat,
  InventoryRef,
  Movement,
  Progression,
  spawnCharacter,
} from "@mp/world";
import type { ActorModelId, AreaId, CharacterId, InventoryId } from "@mp/world";
import type { Tile, TimesPerSecond } from "@mp/std";
import { Vector } from "@mp/math";
import type { DbRepository } from "./repository";

interface CharacterSnapshot {
  readonly areaId: AreaId;
  readonly coords: { readonly x: Tile; readonly y: Tile };
  readonly health: number;
  readonly xp: number;
  readonly speed: Tile;
  readonly attackDamage: number;
  readonly attackSpeed: TimesPerSecond;
  readonly attackRange: Tile;
  readonly maxHealth: number;
  readonly modelId: ActorModelId;
  readonly name: string;
  readonly inventoryId: InventoryId;
}

export interface PersistenceModuleOptions {
  readonly repo: DbRepository;
  readonly syncIntervalMs: number;
  readonly defaultModelId: ActorModelId;
  readonly spawnPointForArea: (
    areaId: AreaId,
  ) => { x: Tile; y: Tile } | undefined;
}

export class PersistenceModule extends RiftServerModule {
  @inject(ClientCharacterRegistry) accessor registry!: ClientCharacterRegistry;

  readonly #opts: PersistenceModuleOptions;
  readonly #snapshots = new Map<EntityId, CharacterSnapshot>();
  #timer?: ReturnType<typeof setInterval>;

  constructor(opts: PersistenceModuleOptions) {
    super();
    this.#opts = opts;
  }

  init(): Cleanup {
    const offConnect = this.server.on(ClientConnected, this.#onConnect);
    const offDisconnect = this.server.on(
      ClientDisconnected,
      this.#onDisconnect,
    );
    this.#timer = setInterval(
      () => void this.#flushDirty(),
      this.#opts.syncIntervalMs,
    );

    return async () => {
      offConnect();
      offDisconnect();
      if (this.#timer) {
        clearInterval(this.#timer);
        this.#timer = undefined;
      }
      await this.#flushDirty();
      await this.#opts.repo.dispose();
    };
  }

  #onConnect = (event: RiftServerEvent<{ clientId: ClientId }>): void => {
    const { clientId } = event.data;
    const userId = this.registry.getUserId(clientId);
    if (!userId) return;
    void clientId;
    void this.#opts;
    void event;
  };

  #onDisconnect = async (
    event: RiftServerEvent<{ clientId: ClientId }>,
  ): Promise<void> => {
    const characterEnt = this.registry.getCharacterEntity(event.data.clientId);
    if (characterEnt === undefined) return;
    await this.#flushEntity(characterEnt, this.server.world);
    this.#snapshots.delete(characterEnt);
  };

  async #flushDirty(): Promise<void> {
    const entityIds: EntityId[] = [];
    for (const [id] of this.server.world.query(
      CharacterTag,
      Movement,
      Combat,
      Progression,
      InventoryRef,
      AreaTag,
    )) {
      entityIds.push(id);
    }
    await Promise.all(
      entityIds.map((id) => this.#flushEntity(id, this.server.world)),
    );
  }

  async #flushEntity(id: EntityId, world: World): Promise<void> {
    const tag = world.get(id, CharacterTag);
    const mv = world.get(id, Movement);
    const combat = world.get(id, Combat);
    const prog = world.get(id, Progression);
    const inv = world.get(id, InventoryRef);
    const area = world.get(id, AreaTag);
    if (!tag || !mv || !combat || !prog || !inv || !area) return;
    const next: CharacterSnapshot = {
      areaId: area.areaId,
      coords: mv.coords,
      health: combat.health,
      xp: prog.xp,
      speed: mv.speed,
      attackDamage: combat.attackDamage,
      attackSpeed: combat.attackSpeed,
      attackRange: combat.attackRange,
      maxHealth: combat.maxHealth,
      modelId: this.#opts.defaultModelId,
      name: "",
      inventoryId: inv.inventoryId,
    };
    const prev = this.#snapshots.get(id);
    if (prev && shallowEqual(prev, next)) {
      return;
    }
    const result = await this.#opts.repo.upsertCharacter({
      characterId: tag.characterId,
      fields: {
        areaId: next.areaId,
        coords: new Vector(next.coords.x, next.coords.y),
        speed: next.speed,
        health: next.health,
        maxHealth: next.maxHealth,
        attackDamage: next.attackDamage,
        attackSpeed: next.attackSpeed,
        attackRange: next.attackRange,
        xp: next.xp,
      },
    });
    if (result.isOk()) {
      this.#snapshots.set(id, next);
    }
  }

  async hydrateCharacter(
    world: World,
    characterId: CharacterId,
    userId: string,
  ): Promise<EntityId | undefined> {
    const result = await this.#opts.repo.selectCharacterRow(characterId);
    if (result.isErr()) {
      return undefined;
    }
    const row = result.value;
    if (!row) {
      return undefined;
    }
    const id = spawnCharacter(world, {
      characterId: row.id,
      userId: row.userId,
      name: row.name,
      modelId: row.modelId,
      areaId: row.areaId,
      coords: { x: row.coords.x, y: row.coords.y },
      inventoryId: row.inventoryId,
      speed: row.speed,
      health: row.health,
      maxHealth: row.maxHealth,
      attackDamage: row.attackDamage,
      attackSpeed: row.attackSpeed,
      attackRange: row.attackRange,
      xp: row.xp,
    });
    void userId;
    return id;
  }
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  for (const key of Object.keys(a) as (keyof T)[]) {
    const av = a[key];
    const bv = b[key];
    if (av === bv) continue;
    if (
      typeof av === "object" &&
      av !== null &&
      typeof bv === "object" &&
      bv !== null
    ) {
      if (!shallowEqual(av as object, bv as object)) return false;
      continue;
    }
    return false;
  }
  return true;
}
