import { pgTable, uuid, real } from "@mp-modules/db";
import type { UserId } from "@mp/auth";
import type { Branded, Tile, TimesPerSecond } from "@mp/std";
import { areaId } from "@mp-modules/area";
import type { MovementTrait } from "../../traits/movement";
import type { AppearanceTrait } from "../../traits/appearance";
import { vector } from "../../../../../modules/db/src/types/vector";
import type { CombatTrait } from "../../traits/combat";

export const userId = () => uuid().$type<UserId>();

export const characterId = () => uuid().$type<CharacterId>();

export const characterTable = pgTable("character", {
  id: characterId().primaryKey().defaultRandom(),
  coords: vector<Tile>().notNull(),
  areaId: areaId().notNull(),
  speed: real().$type<Tile>().notNull(),
  userId: userId().notNull(),
  health: real().notNull(),
  maxHealth: real().notNull(),
  attackDamage: real().notNull(),
  attackSpeed: real().$type<TimesPerSecond>().notNull(),
  attackRange: real().$type<Tile>().notNull(),
});

type DBCharacter = typeof characterTable.$inferSelect;

export interface Character
  extends DBCharacter,
    AppearanceTrait,
    MovementTrait,
    CombatTrait {}

export type CharacterId = Branded<string, "CharacterId">;
