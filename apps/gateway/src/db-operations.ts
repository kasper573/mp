import type { DbClient } from "@mp/db";
import { Character } from "@mp/db";
import type { CharacterId } from "@mp/db/types";
import type { Logger } from "@mp/logger";
import type { UserId } from "@mp/oauth";

export function saveOnlineCharacters(db: DbClient, logger: Logger) {
  return function save(onlineCharacterIds: CharacterId[]) {
    void db
      .getRepository(Character)
      .createQueryBuilder()
      .update(Character)
      .set({
        online: () =>
          `id = ANY(ARRAY[${onlineCharacterIds.map((id) => `'${id}'`).join(",")}]::varchar[])`,
      })
      .execute()
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
  const count = await db.getRepository(Character).count({
    where: {
      userId,
      id: characterId,
    },
  });

  return count > 0;
}
