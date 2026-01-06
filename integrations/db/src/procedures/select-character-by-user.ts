import type { UserId } from "@mp/auth";
import { eq } from "drizzle-orm";
import { characterTable } from "../schema";
import { procedure } from "../utils/procedure";

export const selectCharacterByUser = procedure()
  .input<UserId>()
  .query(async (drizzle, userId) => {
    const result = await drizzle
      .select({
        id: characterTable.id,
        name: characterTable.name,
        xp: characterTable.xp,
      })
      .from(characterTable)
      .where(eq(characterTable.userId, userId))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  });
