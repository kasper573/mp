import { integer, pgTable, uuid } from "drizzle-orm/pg-core";
import type { UserId } from "@mp/auth";
import type { Branded, Tile } from "@mp/std";
import type { MovementTrait } from "../../traits/movement";
import type { AppearanceTrait } from "../../traits/appearance";
import { areaId } from "../area/schema";
import { vector } from "../../db/types/vector";
import type { CombatTrait } from "../../traits/combat";

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
  extends DBCharacter,
    MovementTrait,
    AppearanceTrait,
    CombatTrait {}

export type CharacterId = Branded<string, "CharacterId">;
