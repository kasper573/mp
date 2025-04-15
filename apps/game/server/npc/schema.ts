import { integer, pgTable, uuid, relations, vector } from "@mp/db";
import type { Branded, Tile } from "@mp/std";
import type { MovementTrait } from "../traits/movement";
import type { AppearanceTrait } from "../traits/appearance";
import type { CombatTrait } from "../traits/combat";
import { areaId } from "../area/schema";

export type NPCId = Branded<string, "NPCId">;
export const npcId = () => uuid().$type<NPCId>();

/**
 * Static information about an NPC.
 */
export const npcTable = pgTable("npc", {
  id: npcId().primaryKey().defaultRandom(),
  speed: integer().$type<Tile>().notNull(),
});

export type NPC = typeof npcTable.$inferSelect;

export const npcRelations = relations(npcTable, ({ many }) => ({
  posts: many(npcSpawnTable),
}));

export type NPCSpawnId = Branded<string, "NPCSpawnId">;
export const npcSpawnId = () => uuid().$type<NPCSpawnId>();

/**
 * Information about how npc instances should be spawned
 */
export const npcSpawnTable = pgTable("npc_spawn", {
  id: npcSpawnId().primaryKey().defaultRandom(),
  count: integer().notNull(),
  areaId: areaId().notNull(),
  npcId: npcId()
    .notNull()
    .references(() => npcTable.id, { onDelete: "cascade" }),
  coords: vector<Tile>(),
  randomRadius: integer(),
});

export type NPCSpawn = typeof npcSpawnTable.$inferSelect;

/**
 * One spawned instance of a specific NPC.
 * Does not get persisted in the database.
 */
export interface NPCInstance
  extends Omit<NPC, "id">,
    MovementTrait,
    AppearanceTrait,
    CombatTrait {
  id: NPCInstanceId;
  npcId: NPCId;
}

export type NPCInstanceId = Branded<string, "NPCInstanceId">;
