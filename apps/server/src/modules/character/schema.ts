import type { AreaId } from "@mp/data";
import { integer, pgTable, serial } from "drizzle-orm/pg-core";
import type { UserId } from "@mp/auth-server";
import { branded } from "../../db/types/branded";
import { vector } from "../../db/types/vector";
import type { MovementTrait } from "../../traits/movement";
import type { AppearanceTrait } from "../../traits/appearance";

export const characterTable = pgTable("character", {
  id: serial().primaryKey(),
  coords: vector("coords").notNull(),
  areaId: branded<AreaId>("area_id").notNull(),
  speed: integer("speed").notNull(),
  userId: branded<UserId>("user_id").notNull(),
});

type DBCharacter = typeof characterTable.$inferSelect;

export interface Character
  extends DBCharacter,
    MovementTrait,
    AppearanceTrait {}

export type CharacterId = Character["id"];
