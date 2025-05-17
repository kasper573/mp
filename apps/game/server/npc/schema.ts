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

// TODO would like to use pgEnum but it's bugged: https://github.com/drizzle-team/drizzle-orm/issues/3514
export type NpcAggroType = Npc["aggroType"];
export const npcAggroType = varchar({
  enum: [
    /**
     * Will never aggro.
     */
    "pacifist",
    /**
     * Will aggro if attacked.
     */
    "defensive",
    /**
     * Will aggro if an actor considered an enemy is present.
     */
    "aggressive",
    /**
     * Will aggro if attacked or if an actor considered an ally is attacked.
     */
    "protective",
  ],
});

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
  aggroType: npcAggroType.notNull(),
  aggroRange: real().$type<Tile>().notNull(),
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
  /**
   * Takes precedence over the aggro type of the NPC.
   * If not set, the NPC's aggro type will be used.
   */
  aggroType: npcAggroType,
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
  spawnId: NpcSpawnId;
}

export type NpcInstanceId = Branded<string, "NPCInstanceId">;
