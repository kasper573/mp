import type { Cleanup } from "@rift/module";
import type { ClientId, EntityId, inferServerEvent, World } from "@rift/core";
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
  JoinAsPlayer,
  Leave,
  Movement,
  Progression,
  Respawn,
  spawnCharacter,
} from "@mp/world";
import type {
  ActorModelId,
  ActorModelLookup,
  AreaId,
  CharacterId,
  InventoryId,
} from "@mp/world";
import { combine, type Tile, type TimesPerSecond } from "@mp/std";
import type { Vector } from "@mp/math";
import type { DbRepository } from "./repository";

interface CharacterSnapshot {
  readonly areaId: AreaId;
  readonly coords: Vector<Tile>;
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
  readonly actorModels: ActorModelLookup;
  readonly spawnPointForArea: (areaId: AreaId) => Vector<Tile> | undefined;
}

export class PersistenceModule extends RiftServerModule {
  @inject(ClientCharacterRegistry) accessor registry!: ClientCharacterRegistry;

  readonly #opts: PersistenceModuleOptions;
  readonly #snapshots = new Map<EntityId, CharacterSnapshot>();
  readonly #entityByClient = new Map<ClientId, EntityId>();
  #timer?: ReturnType<typeof setInterval>;

  constructor(opts: PersistenceModuleOptions) {
    super();
    this.#opts = opts;
  }

  init(): Cleanup {
    this.#timer = setInterval(
      () => void this.#flushDirty(),
      this.#opts.syncIntervalMs,
    );
    const offEvents = combine(
      this.server.on(ClientConnected, this.#onConnect),
      this.server.on(ClientDisconnected, this.#onDisconnect),
      this.server.on(JoinAsPlayer, this.#onJoinAsPlayer),
      this.server.on(Leave, this.#onLeave),
      this.server.on(Respawn, this.#onRespawn),
    );
    return async () => {
      offEvents();
      if (this.#timer) {
        clearInterval(this.#timer);
        this.#timer = undefined;
      }
      await this.#flushDirty();
      await this.#opts.repo.dispose();
    };
  }

  #onConnect = (event: inferServerEvent<typeof ClientConnected>): void => {
    void event;
  };

  #onJoinAsPlayer = async (
    event: inferServerEvent<typeof JoinAsPlayer>,
  ): Promise<void> => {
    if (event.source.type !== "wire") {
      return;
    }
    const clientId = event.source.clientId;
    const userId = this.registry.getUserId(clientId);
    if (!userId) {
      return;
    }
    const access = await this.#opts.repo.mayAccessCharacter({
      userId,
      characterId: event.data,
    });
    if (access.isErr() || !access.value) {
      return;
    }
    const existing = this.registry.getCharacterEntity(clientId);
    if (existing !== undefined) {
      return;
    }
    this.#destroyStaleCharacterEntities(event.data);
    const entityId = await this.hydrateCharacter(this.server.world, event.data);
    if (entityId === undefined) {
      return;
    }
    this.#entityByClient.set(clientId, entityId);
    this.registry.setCharacterEntity(clientId, entityId);
  };

  #destroyStaleCharacterEntities(characterId: CharacterId): void {
    const stale: EntityId[] = [];
    for (const [id, tag] of this.server.world.query(CharacterTag)) {
      if (tag.characterId === characterId) {
        stale.push(id);
      }
    }
    for (const id of stale) {
      this.#snapshots.delete(id);
      this.server.world.destroy(id);
    }
  }

  #onRespawn = (event: inferServerEvent<typeof Respawn>): void => {
    if (event.source.type !== "wire") {
      return;
    }
    const characterEnt = this.registry.getCharacterEntity(
      event.source.clientId,
    );
    if (characterEnt === undefined) {
      return;
    }
    const combat = this.server.world.get(characterEnt, Combat);
    const area = this.server.world.get(characterEnt, AreaTag);
    if (!combat || !area) return;
    if (combat.alive) return;
    const spawn = this.#opts.spawnPointForArea(area.areaId);
    if (!spawn) return;
    this.server.world.set(characterEnt, Combat, {
      ...combat,
      health: combat.maxHealth,
      alive: true,
      attackTargetId: undefined,
      lastAttackMs: undefined,
    });
    const movement = this.server.world.get(characterEnt, Movement);
    if (movement) {
      this.server.world.set(characterEnt, Movement, {
        ...movement,
        coords: spawn,
        path: [],
        moveTarget: undefined,
      });
    }
  };

  #onLeave = (event: inferServerEvent<typeof Leave>): void => {
    if (event.source.type !== "wire") {
      return;
    }
    this.#cleanupClient(event.source.clientId);
  };

  #onDisconnect = (
    event: inferServerEvent<typeof ClientDisconnected>,
  ): void => {
    this.#cleanupClient(event.data.clientId);
  };

  #cleanupClient(clientId: ClientId): void {
    const characterEnt = this.#entityByClient.get(clientId);
    if (characterEnt === undefined) return;
    this.#entityByClient.delete(clientId);
    void this.#flushEntity(characterEnt, this.server.world);
    this.#snapshots.delete(characterEnt);
    this.server.world.destroy(characterEnt);
    this.registry.clearCharacterEntity(clientId);
  }

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
        coords: next.coords,
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
      coords: row.coords,
      inventoryId: row.inventoryId,
      speed: row.speed,
      health: row.health,
      maxHealth: row.maxHealth,
      attackDamage: row.attackDamage,
      attackSpeed: row.attackSpeed,
      attackRange: row.attackRange,
      xp: row.xp,
      actorModels: this.#opts.actorModels,
    });
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
