import type { UserId } from "@mp/auth";
import { and, eq } from "drizzle-orm";
import { characterTable } from "../schema";
import type { CharacterId } from "@mp/game-shared";
import { procedure } from "../utils/procedure";

export const mayAccessCharacter = procedure()
  .input<{ userId: UserId; characterId: CharacterId }>()
  .query(async (drizzle, { userId, characterId }) => {
    const matches = await drizzle.$count(
      drizzle
        .select()
        .from(characterTable)
        .where(
          and(
            eq(characterTable.userId, userId),
            eq(characterTable.id, characterId),
          ),
        ),
    );
    return matches > 0;
  });
