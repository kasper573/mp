import {
  integer,
  pgTable,
  relations,
  vector,
  shortId,
  real,
  varchar,
} from "@mp/db";
import type { Branded, Tile, TimesPerSecond } from "@mp/std";
import type { MovementTrait } from "../traits/movement";
import { actorModelId, type AppearanceTrait } from "../traits/appearance";
import type { CombatTrait } from "../traits/combat";
import { areaId } from "../area/schema";

export type NpcId = Branded<string, "NPCId">;
export const npcId = () => shortId().$type<NpcId>();

/**
 * Static information about an NPC.
 */
export const npcTable = pgTable("npc", {
  id: npcId().primaryKey(),
  speed: integer().$type<Tile>().notNull(),
  maxHealth: real().notNull(),
  attackDamage: real().notNull(),
  attackSpeed: real().$type<TimesPerSecond>().notNull(),
  attackRange: real().$type<Tile>().notNull(),
  modelId: actorModelId().notNull(),
  name: varchar({ length: 64 }).notNull(),
});

export type Npc = typeof npcTable.$inferSelect;

export const npcRelations = relations(npcTable, ({ many }) => ({
  posts: many(npcSpawnTable),
}));

export type NpcSpawnId = Branded<string, "NPCSpawnId">;
export const npcSpawnId = () => shortId().$type<NpcSpawnId>();

/**
 * Information about how npc instances should be spawned
 */
export const npcSpawnTable = pgTable("npc_spawn", {
  id: npcSpawnId().primaryKey(),
  count: integer().notNull(),
  areaId: areaId().notNull(),
  npcId: npcId()
    .notNull()
    .references(() => npcTable.id, { onDelete: "cascade" }),
  coords: vector<Tile>(),
  randomRadius: integer(),
});

export type NpcSpawn = typeof npcSpawnTable.$inferSelect;

/**
 * One spawned instance of a specific NPC.
 * Does not get persisted in the database.
 */
export interface NpcInstance
  extends Omit<Npc, "id">,
    MovementTrait,
    AppearanceTrait,
    CombatTrait {
  id: NpcInstanceId;
  npcId: NpcId;
}

export type NpcInstanceId = Branded<string, "NPCInstanceId">;
