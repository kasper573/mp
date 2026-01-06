import type { UserId } from "@mp/auth";
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
  NpcDefinitionId,
  NpcRewardId,
  NpcSpawnId,
} from "@mp/game-shared";
import { npcTypes } from "@mp/game-shared";
import { path } from "./types/path";
import { shortId } from "./types/short-id";
import { vector } from "./types/vector";

const actorModelId = () => varchar({ length: 64 }).$type<ActorModelId>();
export const actorModelTable = pgTable("actor_model", {
  id: actorModelId().primaryKey(),
});

const areaId = () => varchar({ length: 60 }).$type<AreaId>();
export const areaTable = pgTable("area", {
  id: areaId().primaryKey(),
});

export const inventoryTable = pgTable("inventory", {
  id: shortId<InventoryId>().$defaultFn(createShortId).primaryKey(),
});

const sharedItemDefinitionColumns = {
  name: varchar({ length: 64 }).notNull(),
};

const sharedItemInstanceColumns = {
  inventoryId: shortId<InventoryId>()
    .notNull()
    .references(() => inventoryTable.id),
};

export const consumableDefinitionTable = pgTable("consumable_definition", {
  id: shortId<ConsumableDefinitionId>().$defaultFn(createShortId).primaryKey(),
  ...sharedItemDefinitionColumns,
  maxStackSize: integer().notNull(),
});

export const consumableInstanceTable = pgTable("consumable_instance", {
  id: shortId<ConsumableInstanceId>().$defaultFn(createShortId).primaryKey(),
  definitionId: shortId<ConsumableDefinitionId>()
    .notNull()
    .references(() => consumableDefinitionTable.id),
  ...sharedItemInstanceColumns,
  stackSize: integer().notNull(),
});

export const equipmentDefinitionTable = pgTable("equipment_definition", {
  id: shortId<EquipmentDefinitionId>().$defaultFn(createShortId).primaryKey(),
  ...sharedItemDefinitionColumns,
  maxDurability: integer().notNull(),
});

export const equipmentInstanceTable = pgTable("equipment_instance", {
  id: shortId<EquipmentInstanceId>().$defaultFn(createShortId).primaryKey(),
  definitionId: shortId<EquipmentDefinitionId>()
    .notNull()
    .references(() => equipmentDefinitionTable.id),
  ...sharedItemInstanceColumns,
  durability: integer().notNull(),
});

const userId = () => uuid().$type<UserId>();

export const characterTable = pgTable("character", {
  id: shortId<CharacterId>().$defaultFn(createShortId).primaryKey(),
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
  name: varchar({ length: 64 }).unique().notNull(),
  online: boolean().notNull().default(false),
  xp: real().notNull(),
  inventoryId: shortId<InventoryId>()
    .notNull()
    .references(() => inventoryTable.id),
});

// TODO would like to use pgEnum but it's bugged: https://github.com/drizzle-team/drizzle-orm/issues/3514
export const npcType = varchar({ enum: npcTypes });

/**
 * Static information about an NPC.
 */
export const npcTable = pgTable("npc", {
  id: shortId<NpcDefinitionId>().$defaultFn(createShortId).primaryKey(),
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

export const npcRewardTable = pgTable("npc_reward", {
  id: shortId<NpcRewardId>().$defaultFn(createShortId).primaryKey(),
  npcId: shortId<NpcDefinitionId>()
    .notNull()
    .references(() => npcTable.id),
  consumableItemId: shortId<ConsumableDefinitionId>().references(
    () => consumableDefinitionTable.id,
  ),
  equipmentItemId: shortId<EquipmentDefinitionId>().references(
    () => equipmentDefinitionTable.id,
  ),
  itemAmount: integer(),
  xp: real(),
});

/**
 * Information about how npc instances should be spawned
 */
export const npcSpawnTable = pgTable("npc_spawn", {
  id: shortId<NpcSpawnId>().$defaultFn(createShortId).primaryKey(),
  count: integer().notNull(),
  areaId: areaId()
    .notNull()
    .references(() => areaTable.id),
  npcId: shortId<NpcDefinitionId>()
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
