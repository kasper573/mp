import type { DbClient } from "@mp/db";
import { and, characterTable, eq, inArray } from "@mp/db";
import type { CharacterId } from "@mp/db/types";
import type { Logger } from "@mp/logger";
import type { UserId } from "@mp/oauth";

export function saveOnlineCharacters(db: DbClient, logger: Logger) {
  return function save(onlineCharacterIds: CharacterId[]) {
    void db
      .update(characterTable)
      .set({ online: inArray(characterTable.id, onlineCharacterIds) })
      .catch((error) =>
        logger.error(
          new Error("Failed to save online characters", { cause: error }),
        ),
      );
  };
}

export async function hasAccessToCharacter(
  db: DbClient,
  userId: UserId,
  characterId: CharacterId,
) {
  const matches = await db.$count(
    db
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
}
