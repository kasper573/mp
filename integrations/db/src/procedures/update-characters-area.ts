import type { ActorModelLookup, Character } from "@mp/game-shared";
import { eq } from "drizzle-orm";
import { characterTable } from "../schema";
import { characterFromDbFields } from "../transform";
import type { CharacterId, AreaId } from "@mp/game-shared";
import { procedure } from "../procedure";

export const updateCharactersArea = procedure()
  .input<{
    actorModels: ActorModelLookup;
    characterId: CharacterId;
    newAreaId: AreaId;
  }>()
  .query(
    async (
      drizzle,
      { actorModels, characterId, newAreaId },
    ): Promise<Character> => {
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
    },
  );
