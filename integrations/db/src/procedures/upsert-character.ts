import { eq } from "drizzle-orm";
import type { CharacterId } from "@mp/world";
import { characterTable } from "../schema";
import { procedure } from "../utils/procedure";

export interface CharacterUpdateFields {
  characterId: CharacterId;
  fields: Partial<typeof characterTable.$inferInsert>;
}

export const upsertCharacter = procedure()
  .input<CharacterUpdateFields>()
  .query(async (drizzle, { characterId, fields }) => {
    await drizzle
      .update(characterTable)
      .set(fields)
      .where(eq(characterTable.id, characterId));
  });
