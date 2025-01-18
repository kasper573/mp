import type { AreaId } from "@mp/data";
import { integer, pgTable, serial } from "drizzle-orm/pg-core";
import { branded } from "../../db/types/branded";
import { vector } from "../../db/types/vector";
import type { MovementTrait } from "../../traits/movement";

export const npcTable = pgTable("npcs", {
  id: serial().primaryKey(),
  coords: vector("coords").notNull(),
  areaId: branded<AreaId>("area_id").notNull(),
  speed: integer("speed").notNull(),
});

type DBNPC = typeof npcTable.$inferSelect;

export interface NPC extends DBNPC, MovementTrait {}

export type NPCId = NPC["id"];
