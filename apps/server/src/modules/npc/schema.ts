import { integer, pgTable, serial } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { vector } from "../../db/types/vector";
import type { MovementTrait } from "../../traits/movement";
import type { AppearanceTrait } from "../../traits/appearance";
import { areaId } from "../area/schema";

/**
 * Static information about an NPC.
 */
export const npcTable = pgTable("npc", {
  id: serial().primaryKey(),
  speed: integer("speed").notNull(),
});

export type NPC = typeof npcTable.$inferSelect;

export const npcRelations = relations(npcTable, ({ many }) => ({
  posts: many(npcSpawnTable),
}));

/**
 * Information about how npc instances should be spawned
 */
export const npcSpawnTable = pgTable("npc_spawn", {
  id: serial().primaryKey(),
  count: integer("count").notNull(),
  areaId: areaId.notNull(),
  npcId: integer("npc_id")
    .notNull()
    .references(() => npcTable.id, { onDelete: "cascade" }),
  coords: vector("coords"),
  randomRadius: integer("random_radius"),
});

export type NPCSpawn = typeof npcSpawnTable.$inferSelect;

/**
 * One spawned instance of a specific NPC.
 * Does not get persisted in the database.
 */
export interface NPCInstance
  extends Omit<NPC, "id">,
    MovementTrait,
    AppearanceTrait {
  id: NPCInstanceId;
}

export type NPCInstanceId = string;
