import type { Character } from "@mp/game-shared";
import { eq } from "drizzle-orm";
import type { DbClient } from "../client";
import { characterTable } from "../schema";
import { dbFieldsFromCharacter } from "../transform";

export async function upsertCharacter(db: DbClient, character: Character) {
  await db
    .update(characterTable)
    .set(dbFieldsFromCharacter(character))
    .where(eq(characterTable.id, character.identity.id));
}
