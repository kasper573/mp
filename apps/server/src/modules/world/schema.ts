import type { AreaId, Branded } from "@mp/state";
import { integer, pgTable } from "drizzle-orm/pg-core";
import type { Vector, Path } from "@mp/math";
import { branded } from "../../db/types/branded";
import { vector } from "../../db/types/vector";

export const characterTable = pgTable("characters", {
  id: branded<CharacterId>("id").primaryKey(),
  coords: vector("coords").notNull(),
  destination: vector("destination"),
  areaId: branded<AreaId>("area_id").notNull(),
  speed: integer("speed").notNull(),
});

export type DBCharacter = typeof characterTable.$inferInsert;

export interface Character {
  id: CharacterId;
  coords: Vector;
  path?: Path;
  speed: number;
  areaId: AreaId;
}

export interface WorldState {
  characters: Map<CharacterId, Character>;
}

export type CharacterId = Branded<string, "CharacterId">;
