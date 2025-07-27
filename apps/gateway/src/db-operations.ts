import type { UserId } from "@mp/auth";
import type { DbClient } from "@mp/db-client";
import { and, characterTable, eq, inArray } from "@mp/db-client";
import type { CharacterId } from "@mp/game/server";

export async function saveOnlineCharacters(
  db: DbClient,
  onlineCharacterIds: CharacterId[],
) {
  await db
    .update(characterTable)
    .set({ online: inArray(characterTable.id, onlineCharacterIds) });
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
