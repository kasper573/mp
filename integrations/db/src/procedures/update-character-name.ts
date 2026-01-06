import { and, eq } from "drizzle-orm";
import { characterTable } from "../schema";
import type { CharacterId } from "@mp/game-shared";
import { procedure } from "../utils/procedure";

export const updateCharacterName = procedure()
  .input<{ characterId: CharacterId; newName: string }>()
  .query(async (drizzle, { characterId, newName }): Promise<void> => {
    const result = await drizzle
      .update(characterTable)
      .set({ name: newName })
      .where(and(eq(characterTable.id, characterId)));

    if (!result.rowCount) {
      throw new Error("No character found with the given ID");
    }
  });
