import { eq } from "drizzle-orm";
import type { CharacterId } from "@mp/world";
import { characterTable } from "../schema";
import { procedure } from "../utils/procedure";

export const selectCharacterRow = procedure()
  .input<CharacterId>()
  .query(async (drizzle, characterId) => {
    const [row] = await drizzle
      .select()
      .from(characterTable)
      .where(eq(characterTable.id, characterId))
      .limit(1);
    return row;
  });
