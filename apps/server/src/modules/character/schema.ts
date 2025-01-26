import { integer, pgTable, serial, uuid } from "drizzle-orm/pg-core";
import type { UserId } from "@mp/auth-server";
import type { TileNumber } from "@mp/std";
import type { MovementTrait } from "../../traits/movement";
import type { AppearanceTrait } from "../../traits/appearance";
import { areaId } from "../area/schema";
import { vector } from "../../db/types/vector";

export const userId = uuid().$type<UserId>();

export const characterTable = pgTable("character", {
  id: serial().primaryKey(),
  coords: vector<TileNumber>().notNull(),
  areaId: areaId.notNull(),
  speed: integer().$type<TileNumber>().notNull(),
  userId: userId.notNull(),
});

type DBCharacter = typeof characterTable.$inferSelect;

export interface Character
  extends DBCharacter,
    MovementTrait,
    AppearanceTrait {}

export type CharacterId = Character["id"];
