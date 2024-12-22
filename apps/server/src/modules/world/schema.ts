import type { AreaId, Branded } from "@mp/data";
import { integer, pgTable } from "drizzle-orm/pg-core";
import type { Path } from "@mp/math";
import type { UserId } from "@mp/auth-server";
import { branded } from "../../db/types/branded";
import { vector } from "../../db/types/vector";

export const characterTable = pgTable("characters", {
  id: branded<CharacterId>("id").primaryKey(),
  coords: vector("coords").notNull(),
  areaId: branded<AreaId>("area_id").notNull(),
  speed: integer("speed").notNull(),
  userId: branded<UserId>("user_id").notNull(),
});

export type DBCharacter = typeof characterTable.$inferInsert;

export interface Character extends DBCharacter {
  path?: Path;
}

export type WorldState = {
  characters: Record<CharacterId, Character>;
};

export type CharacterId = Branded<string, "CharacterId">;
