import { integer, pgTable, uuid } from "npm:drizzle-orm/pg-core";
import type { UserId } from "@mp/auth-server";
import type { Branded, Tile } from "@mp/std";
import type { MovementTrait } from "../../traits/movement.ts";
import type { AppearanceTrait } from "../../traits/appearance.ts";
import { areaId } from "../area/schema.ts";
import { vector } from "../../db/types/vector.ts";

export const userId = () => uuid().$type<UserId>();

export const characterId = () => uuid().$type<CharacterId>();

export const characterTable = pgTable("character", {
  id: characterId().primaryKey().defaultRandom(),
  coords: vector<Tile>().notNull(),
  areaId: areaId().notNull(),
  speed: integer().$type<Tile>().notNull(),
  userId: userId().notNull(),
});

type DBCharacter = typeof characterTable.$inferSelect;

export interface Character
  extends DBCharacter, MovementTrait, AppearanceTrait {}

export type CharacterId = Branded<string, "CharacterId">;
