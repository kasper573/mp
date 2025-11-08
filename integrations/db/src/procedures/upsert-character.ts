import type { Character } from "@mp/game-shared";
import { eq } from "drizzle-orm";
import { characterTable } from "../schema";
import { dbFieldsFromCharacter } from "../transform";
import { procedure } from "../procedure";

export const upsertCharacter = procedure()
  .input<Character>()
  .query(async (drizzle, character) => {
    await drizzle
      .update(characterTable)
      .set(dbFieldsFromCharacter(character))
      .where(eq(characterTable.id, character.identity.id));
  });
