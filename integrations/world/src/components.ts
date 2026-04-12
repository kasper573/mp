import { Vector } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";
import type {
  ActorModelId,
  AreaId,
  ItemDefinitionId,
  NpcSpawnId,
} from "@mp/fixtures";
import {
  struct,
  f32,
  u8,
  u16,
  u32,
  bool,
  string,
  tag,
  transform,
} from "@rift/core";

// --- Synced components ---

export const Position = transform(struct({ x: f32(), y: f32() }), {
  encode: (v: Vector<Tile>) => ({ x: v.x, y: v.y }),
  decode: ({ x, y }) => new Vector(x, y) as Vector<Tile>,
});

export const Movement = struct({
  speed: f32<Tile>(),
  dir: u8(),
  moving: bool(),
});

export const Combat = struct({
  health: f32(),
  maxHealth: f32(),
  alive: bool(),
  attackDamage: f32(),
  attackSpeed: f32<TimesPerSecond>(),
  attackRange: f32<Tile>(),
});

export const Appearance = struct({
  modelId: string<ActorModelId>(),
  name: string(),
});

export const NpcIdentity = struct({
  npcType: u8(),
  spawnId: string<NpcSpawnId>(),
});

export const CharacterIdentity = struct({
  clientId: string(),
});

export const AttackTarget = struct({
  targetId: u32(),
});

export const Progression = struct({
  xp: f32(),
});

export const ItemOwner = struct({
  ownerId: u32(),
});

export const ItemDefinitionComp = struct({
  definitionId: string<ItemDefinitionId>(),
  itemType: u8(),
});

export const Stackable = struct({
  stackSize: u16(),
  maxStackSize: u16(),
});

export const Durable = struct({
  durability: u16(),
  maxDurability: u16(),
});

export const AreaTag = struct({
  areaId: string<AreaId>(),
});

/** Marker component for dead NPCs awaiting corpse cleanup */
export const Corpse = tag();

export const allComponents = [
  Position,
  Movement,
  Combat,
  Appearance,
  NpcIdentity,
  CharacterIdentity,
  AttackTarget,
  Progression,
  ItemOwner,
  ItemDefinitionComp,
  Stackable,
  Durable,
  AreaTag,
  Corpse,
];
