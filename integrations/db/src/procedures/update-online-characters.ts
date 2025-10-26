import { inArray } from "drizzle-orm";
import { DbClient } from "../client";
import { characterTable } from "../schema";
import type { CharacterId } from "@mp/game-shared";

export async function updateOnlineCharacters(
  db: DbClient,
  onlineCharacterIds: CharacterId[],
) {
  const drizzle = DbClient.unwrap(db);
  await drizzle
    .update(characterTable)
    .set({ online: inArray(characterTable.id, onlineCharacterIds) });
}
