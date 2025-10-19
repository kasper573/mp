import type { DbClient } from "@mp/db";
import { e } from "@mp/db";
import type { CharacterId } from "@mp/db/types";
import type { Logger } from "@mp/logger";
import type { UserId } from "@mp/oauth";

export function saveOnlineCharacters(db: DbClient, logger: Logger) {
  return function save(onlineCharacterIds: CharacterId[]) {
    // Update all characters: set online=true if ID is in the list, false otherwise
    void e
      .update(e.Character, (char) => ({
        set: {
          online: e.op(
            char.characterId,
            "in",
            e.set(...onlineCharacterIds.map((id) => e.str(id))),
          ),
        },
      }))
      .run(db)
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
  const result = await e
    .select(e.Character, (char) => ({
      filter: e.op(
        e.op(char.userId, "=", e.uuid(userId)),
        "and",
        e.op(char.characterId, "=", e.str(characterId)),
      ),
    }))
    .run(db);

  return result.length > 0;
}
