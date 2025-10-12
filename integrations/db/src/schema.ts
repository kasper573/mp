import type { UserId } from "@mp/oauth";
import { createShortId, type Tile, type TimesPerSecond } from "@mp/std";
import {
  boolean,
  integer,
  pgTable,
  real,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type {
  ActorModelId,
  AreaId,
  CharacterId,
  ConsumableDefinitionId,
  ConsumableInstanceId,
  EquipmentDefinitionId,
  EquipmentInstanceId,
  InventoryId,
  NpcId,
  NpcRewardId,
  NpcSpawnId,
} from "./types";
import { npcTypes } from "./types";
import { path } from "./types/path";
import { shortId } from "./types/short-id";
import { vector } from "./types/vector";

export const actorModelId = () => varchar({ length: 64 }).$type<ActorModelId>();
export const actorModelTable = pgTable("actor_model", {
  id: actorModelId().primaryKey(),
});

export const areaId = () => varchar({ length: 60 }).$type<AreaId>();
export const areaTable = pgTable("area", {
  id: areaId().primaryKey(),
});

export const inventoryId = () => shortId().$type<InventoryId>();
export const inventoryTable = pgTable("inventory", {
  id: inventoryId().$defaultFn(createShortId).primaryKey(),
});

const sharedItemDefinitionColumns = {
  name: varchar({ length: 64 }).notNull(),
};

const sharedItemInstanceColumns = {
  inventoryId: inventoryId()
    .notNull()
    .references(() => inventoryTable.id),
};

export const consumableDefinitionId = () =>
  shortId().$type<ConsumableDefinitionId>();
export const consumableDefinitionTable = pgTable("consumable_definition", {
  id: consumableDefinitionId().$defaultFn(createShortId).primaryKey(),
  ...sharedItemDefinitionColumns,
  maxStackSize: integer().notNull(),
});

export const consumableInstanceId = () =>
  shortId().$type<ConsumableInstanceId>();
export const consumableInstanceTable = pgTable("consumable_instance", {
  id: consumableInstanceId().$defaultFn(createShortId).primaryKey(),
  definitionId: consumableDefinitionId()
    .notNull()
    .references(() => consumableDefinitionTable.id),
  ...sharedItemInstanceColumns,
  stackSize: integer().notNull(),
});

export const equipmentDefinitionId = () =>
  shortId().$type<EquipmentDefinitionId>();
export const equipmentDefinitionTable = pgTable("equipment_definition", {
  id: equipmentDefinitionId().$defaultFn(createShortId).primaryKey(),
  ...sharedItemDefinitionColumns,
  maxDurability: integer().notNull(),
});

export const equipmentInstanceId = () => shortId().$type<EquipmentInstanceId>();
export const equipmentInstanceTable = pgTable("equipment_instance", {
  id: equipmentInstanceId().$defaultFn(createShortId).primaryKey(),
  definitionId: equipmentDefinitionId()
    .notNull()
    .references(() => equipmentDefinitionTable.id),
  ...sharedItemInstanceColumns,
  durability: integer().notNull(),
});

export const userId = () => uuid().$type<UserId>();

export const characterId = () => shortId().$type<CharacterId>();

export const characterTable = pgTable("character", {
  id: characterId().$defaultFn(createShortId).primaryKey(),
  coords: vector<Tile>().notNull(),
  areaId: areaId()
    .notNull()
    .references(() => areaTable.id),
  speed: real().$type<Tile>().notNull(),
  userId: userId().notNull(),
  health: real().notNull(),
  maxHealth: real().notNull(),
  attackDamage: real().notNull(),
  attackSpeed: real().$type<TimesPerSecond>().notNull(),
  attackRange: real().$type<Tile>().notNull(),
  modelId: actorModelId()
    .notNull()
    .references(() => actorModelTable.id),
  name: varchar({ length: 64 }).notNull(),
  online: boolean().notNull().default(false),
  xp: real().notNull(),
  inventoryId: inventoryId()
    .notNull()
    .references(() => inventoryTable.id),
});

export const npcId = () => shortId().$type<NpcId>();

// TODO would like to use pgEnum but it's bugged: https://github.com/drizzle-team/drizzle-orm/issues/3514
export const npcType = varchar({ enum: npcTypes });

/**
 * Static information about an NPC.
 */
export const npcTable = pgTable("npc", {
  id: npcId().$defaultFn(createShortId).primaryKey(),
  speed: integer().$type<Tile>().notNull(),
  maxHealth: real().notNull(),
  attackDamage: real().notNull(),
  attackSpeed: real().$type<TimesPerSecond>().notNull(),
  attackRange: real().$type<Tile>().notNull(),
  modelId: actorModelId()
    .notNull()
    .references(() => actorModelTable.id),
  name: varchar({ length: 64 }).notNull(),
  npcType: npcType.notNull(),
  aggroRange: real().$type<Tile>().notNull(),
});

export const npcRewardId = () => shortId().$type<NpcRewardId>();

export const npcRewardTable = pgTable("npc_reward", {
  id: npcRewardId().$defaultFn(createShortId).primaryKey(),
  npcId: npcId()
    .notNull()
    .references(() => npcTable.id),
  consumableItemId: consumableDefinitionId().references(
    () => consumableDefinitionTable.id,
  ),
  equipmentItemId: equipmentDefinitionId().references(
    () => equipmentDefinitionTable.id,
  ),
  itemAmount: integer(),
  xp: real(),
});

export const npcSpawnId = () => shortId().$type<NpcSpawnId>();

/**
 * Information about how npc instances should be spawned
 */
export const npcSpawnTable = pgTable("npc_spawn", {
  id: npcSpawnId().$defaultFn(createShortId).primaryKey(),
  count: integer().notNull(),
  areaId: areaId()
    .notNull()
    .references(() => areaTable.id),
  npcId: npcId()
    .notNull()
    .references(() => npcTable.id),
  coords: vector<Tile>(),
  randomRadius: integer(),
  patrol: path<Tile>(),
  /**
   * Takes precedence over the npcType field from the NPC table.
   * If not set, the NPC's tables npcType will be used.
   */
  npcType,
});
