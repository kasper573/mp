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
  InventoryId,
  ItemId,
  ItemInstanceId,
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

export type Item = typeof itemTable.$inferSelect;
export const itemId = () => shortId().$type<ItemId>();
export const itemTable = pgTable("item", {
  id: itemId().$defaultFn(createShortId).primaryKey(),
  name: varchar({ length: 64 }).notNull(),
});

export const inventoryId = () => shortId().$type<InventoryId>();
export const inventoryTable = pgTable("inventory", {
  id: inventoryId().$defaultFn(createShortId).primaryKey(),
});

export const itemInstanceId = () => shortId().$type<ItemInstanceId>();
export const itemInstanceTable = pgTable("item_instance", {
  id: itemInstanceId().$defaultFn(createShortId).primaryKey(),
  itemId: itemId()
    .notNull()
    .references(() => itemTable.id),
  inventoryId: inventoryId()
    .notNull()
    .references(() => inventoryTable.id),
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
  itemId: itemId().references(() => itemTable.id),
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
