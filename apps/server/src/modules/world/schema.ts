import type { AreaId } from "@mp/data";
import { integer, pgTable, serial } from "drizzle-orm/pg-core";
import type { Path } from "@mp/math";
import type { UserId, UserIdentity } from "@mp/auth-server";
import type { SyncServer } from "@mp/sync/server";
import { branded } from "../../db/types/branded";
import { vector } from "../../db/types/vector";

export const characterTable = pgTable("characters", {
  id: serial().primaryKey(),
  coords: vector("coords").notNull(),
  areaId: branded<AreaId>("area_id").notNull(),
  speed: integer("speed").notNull(),
  userId: branded<UserId>("user_id").notNull(),
});

type DBCharacter = typeof characterTable.$inferSelect;

export interface Character extends DBCharacter {
  path?: Path;
}

export type WorldState = {
  characters: Record<CharacterId, Character>;
};

export type CharacterId = Character["id"];

export type WorldSyncServer = SyncServer<WorldState, WorldState, UserIdentity>;
