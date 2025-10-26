import { inArray } from "drizzle-orm";
import type { DbClient } from "../client";
import { characterTable } from "../schema";
import type { CharacterId } from "../types";

export async function updateOnlineCharacters(
  db: DbClient,
  onlineCharacterIds: CharacterId[],
) {
  await db
    .update(characterTable)
    .set({ online: inArray(characterTable.id, onlineCharacterIds) });
}
