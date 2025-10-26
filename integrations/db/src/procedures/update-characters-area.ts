import type { ActorModelLookup, Character } from "@mp/game-shared";
import { eq } from "drizzle-orm";
import { DbClient } from "../client";
import { characterTable } from "../schema";
import { characterFromDbFields } from "../transform";
import type { CharacterId, AreaId } from "@mp/game-shared";

export async function updateCharactersArea(
  db: DbClient,
  actorModels: ActorModelLookup,
  characterId: CharacterId,
  newAreaId: AreaId,
): Promise<Character> {
  const drizzle = DbClient.unwrap(db);

  const result = await drizzle.transaction(async (tx) => {
    await tx
      .update(characterTable)
      .set({ areaId: newAreaId })
      .where(eq(characterTable.id, characterId));

    return tx
      .select()
      .from(characterTable)
      .where(eq(characterTable.id, characterId))
      .limit(1);
  });

  if (result.length === 0) {
    throw new Error(`Character with id ${characterId} not found`);
  }

  return characterFromDbFields(result[0], actorModels);
}
