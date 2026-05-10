import type { Cleanup, Feature } from "@rift/feature";
import type { ClientId, EntityId, World } from "@rift/core";
import { ClientConnected, ClientDisconnected } from "@rift/core";
import {
  AreaTag,
  CharacterTag,
  Combat,
  InventoryRef,
  JoinAsPlayer,
  Leave,
  Movement,
  OwnedByClient,
  Progression,
  Respawn,
  entityForClient,
  spawnCharacter,
  type ClientUserRegistry,
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

export interface PersistenceFeatureOptions {
  readonly repo: DbRepository;
  readonly registry: ClientUserRegistry;
  readonly syncIntervalMs: number;
  readonly defaultModelId: ActorModelId;
  readonly actorModels: ActorModelLookup;
  readonly spawnPointForArea: (areaId: AreaId) => Vector<Tile> | undefined;
}

export function persistenceFeature(opts: PersistenceFeatureOptions): Feature {
  return {
    server(server): Cleanup {
      const snapshots = new Map<EntityId, CharacterSnapshot>();
      const flushDirty = (): Promise<void> =>
        flushAllDirty(server.world, opts.repo, snapshots, opts.defaultModelId);
      const timer = setInterval(() => void flushDirty(), opts.syncIntervalMs);

      const offEvents = combine(
        server.on(ClientConnected, () => {
          // No-op; user identity is recorded by the app on transport open.
        }),
        server.on(ClientDisconnected, (event) => {
          cleanupClient(server.world, snapshots, opts, event.data.clientId);
        }),
        server.on(JoinAsPlayer, async (event) => {
          if (event.source.type !== "wire") return;
          const clientId = event.source.clientId;
          const userId = opts.registry.getUserId(clientId);
          if (!userId) return;
          const access = await opts.repo.mayAccessCharacter({
            userId,
            characterId: event.data,
          });
          if (access.isErr() || !access.value) return;
          if (entityForClient(server.world, clientId) !== undefined) return;
          destroyStaleCharacterEntities(server.world, snapshots, event.data);
          const entityId = await hydrateCharacter(
            server.world,
            opts,
            event.data,
          );
          if (entityId === undefined) return;
          if (server.world.has(entityId, OwnedByClient)) {
            server.world.write(entityId, OwnedByClient, { clientId });
          } else {
            server.world.add(entityId, OwnedByClient, { clientId });
          }
        }),
        server.on(Leave, (event) => {
          if (event.source.type !== "wire") return;
          cleanupClient(server.world, snapshots, opts, event.source.clientId);
        }),
        server.on(Respawn, (event) => {
          if (event.source.type !== "wire") return;
          const characterEnt = entityForClient(
            server.world,
            event.source.clientId,
          );
          if (characterEnt === undefined) return;
          const combat = server.world.get(characterEnt, Combat);
          const area = server.world.get(characterEnt, AreaTag);
          if (!combat || !area) return;
          if (combat.alive) return;
          const spawn = opts.spawnPointForArea(area.areaId);
          if (!spawn) return;
          server.world.write(characterEnt, Combat, {
            health: combat.maxHealth,
            alive: true,
            attackTargetId: undefined,
            lastAttackMs: undefined,
          });
          if (server.world.has(characterEnt, Movement)) {
            server.world.write(characterEnt, Movement, {
              coords: spawn,
              moveTarget: undefined,
            });
          }
        }),
      );

      return async () => {
        offEvents();
        clearInterval(timer);
        await flushDirty();
        await opts.repo.dispose();
      };
    },
  };
}

function destroyStaleCharacterEntities(
  world: World,
  snapshots: Map<EntityId, CharacterSnapshot>,
  characterId: CharacterId,
): void {
  const stale: EntityId[] = [];
  for (const [id, tag] of world.query(CharacterTag)) {
    if (tag.characterId === characterId) stale.push(id);
  }
  for (const id of stale) {
    snapshots.delete(id);
    world.destroy(id);
  }
}

function cleanupClient(
  world: World,
  snapshots: Map<EntityId, CharacterSnapshot>,
  opts: PersistenceFeatureOptions,
  clientId: ClientId,
): void {
  const characterEnt = entityForClient(world, clientId);
  if (characterEnt === undefined) return;
  void flushEntity(
    world,
    opts.repo,
    snapshots,
    opts.defaultModelId,
    characterEnt,
  );
  snapshots.delete(characterEnt);
  world.destroy(characterEnt);
}

async function flushAllDirty(
  world: World,
  repo: DbRepository,
  snapshots: Map<EntityId, CharacterSnapshot>,
  defaultModelId: ActorModelId,
): Promise<void> {
  const entityIds: EntityId[] = [];
  for (const [id] of world.query(
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
    entityIds.map((id) =>
      flushEntity(world, repo, snapshots, defaultModelId, id),
    ),
  );
}

async function flushEntity(
  world: World,
  repo: DbRepository,
  snapshots: Map<EntityId, CharacterSnapshot>,
  defaultModelId: ActorModelId,
  id: EntityId,
): Promise<void> {
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
    modelId: defaultModelId,
    name: "",
    inventoryId: inv.inventoryId,
  };
  const prev = snapshots.get(id);
  if (prev && shallowEqual(prev, next)) return;
  const result = await repo.upsertCharacter({
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
  if (result.isOk()) snapshots.set(id, next);
}

async function hydrateCharacter(
  world: World,
  opts: PersistenceFeatureOptions,
  characterId: CharacterId,
): Promise<EntityId | undefined> {
  const result = await opts.repo.selectCharacterRow(characterId);
  if (result.isErr()) return undefined;
  const row = result.value;
  if (!row) return undefined;
  return spawnCharacter(world, {
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
    actorModels: opts.actorModels,
  });
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
