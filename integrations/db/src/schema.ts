import type { UserId } from "@mp/auth";
import { createShortId, type Tile, type TimesPerSecond } from "@mp/std";
import { integer, pgTable, real, uuid, varchar } from "drizzle-orm/pg-core";
import type {
  ActorModelId,
  AreaId,
  CharacterId,
  ConsumableDefinitionId,
  ConsumableInstanceId,
  EquipmentDefinitionId,
  EquipmentInstanceId,
  InventoryId,
} from "@mp/world";
import { shortId } from "./types/short-id";
import { vector } from "./types/vector";

const userId = () => uuid().$type<UserId>();
const actorModelId = () => varchar({ length: 64 }).$type<ActorModelId>();
const areaId = () => varchar({ length: 60 }).$type<AreaId>();

export const inventoryTable = pgTable("inventory", {
  id: shortId<InventoryId>().$defaultFn(createShortId).primaryKey(),
});

export const characterTable = pgTable("character", {
  id: shortId<CharacterId>().$defaultFn(createShortId).primaryKey(),
  coords: vector<Tile>().notNull(),
  areaId: areaId().notNull(),
  speed: real().$type<Tile>().notNull(),
  userId: userId().notNull(),
  health: real().notNull(),
  maxHealth: real().notNull(),
  attackDamage: real().notNull(),
  attackSpeed: real().$type<TimesPerSecond>().notNull(),
  attackRange: real().$type<Tile>().notNull(),
  modelId: actorModelId().notNull(),
  name: varchar({ length: 64 }).unique().notNull(),
  xp: real().notNull(),
  inventoryId: shortId<InventoryId>()
    .notNull()
    .references(() => inventoryTable.id),
});

export const consumableInstanceTable = pgTable("consumable_instance", {
  id: shortId<ConsumableInstanceId>().$defaultFn(createShortId).primaryKey(),
  definitionId: shortId<ConsumableDefinitionId>().notNull(),
  inventoryId: shortId<InventoryId>()
    .notNull()
    .references(() => inventoryTable.id),
  stackSize: integer().notNull(),
});

export const equipmentInstanceTable = pgTable("equipment_instance", {
  id: shortId<EquipmentInstanceId>().$defaultFn(createShortId).primaryKey(),
  definitionId: shortId<EquipmentDefinitionId>().notNull(),
  inventoryId: shortId<InventoryId>()
    .notNull()
    .references(() => inventoryTable.id),
  durability: integer().notNull(),
});

export type CharacterRow = typeof characterTable.$inferSelect;
export type CharacterInsert = typeof characterTable.$inferInsert;
export type InventoryRow = typeof inventoryTable.$inferSelect;
export type ConsumableInstanceRow = typeof consumableInstanceTable.$inferSelect;
export type EquipmentInstanceRow = typeof equipmentInstanceTable.$inferSelect;
