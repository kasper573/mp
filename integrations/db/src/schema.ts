import type { UserId } from "@mp/auth";
import { createShortId } from "@mp/std";
import { integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import type {
  ActorModelId,
  AreaId,
  CharacterId,
  ConsumableDefinitionId,
  EquipmentDefinitionId,
} from "@mp/world";

import { shortId } from "./types/short-id";

const actorModelId = () => varchar({ length: 64 }).$type<ActorModelId>();
export const actorModelTable = pgTable("actor_model", {
  id: actorModelId().primaryKey(),
});

const areaId = () => varchar({ length: 60 }).$type<AreaId>();
export const areaTable = pgTable("area", {
  id: areaId().primaryKey(),
});

const sharedItemDefinitionColumns = {
  name: varchar({ length: 64 }).notNull(),
};

export const consumableDefinitionTable = pgTable("consumable_definition", {
  id: shortId<ConsumableDefinitionId>().$defaultFn(createShortId).primaryKey(),
  ...sharedItemDefinitionColumns,
  maxStackSize: integer().notNull(),
});

export const equipmentDefinitionTable = pgTable("equipment_definition", {
  id: shortId<EquipmentDefinitionId>().$defaultFn(createShortId).primaryKey(),
  ...sharedItemDefinitionColumns,
  maxDurability: integer().notNull(),
});

const userId = () => uuid().$type<UserId>();

/**
 * Cross-area character metadata. Runtime ECS state (position, health, stats,
 * inventory, xp) is owned by game-service and persisted via @rift/persistence.
 * This table only stores identity and the area the character is currently in,
 * which the gateway uses to route ws connections.
 */
export const characterTable = pgTable("character", {
  id: shortId<CharacterId>().$defaultFn(createShortId).primaryKey(),
  userId: userId().notNull(),
  areaId: areaId()
    .notNull()
    .references(() => areaTable.id),
  name: varchar({ length: 64 }).unique().notNull(),
  modelId: actorModelId()
    .notNull()
    .references(() => actorModelTable.id),
});
