import { eq } from "drizzle-orm";
import { characterTable } from "../schema";
import type { CharacterId, AreaId } from "@mp/game-shared";
import { procedure } from "../utils/procedure";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";

export const updateCharactersArea = procedure()
  .input<{
    characterId: CharacterId;
    newAreaId: AreaId;
    newCoords: Vector<Tile>;
    health?: number;
  }>()
  .query(
    async (drizzle, { characterId, newAreaId, newCoords, health }): Promise<void> => {
      const updateData: { areaId: AreaId; coords: Vector<Tile>; health?: number } = {
        areaId: newAreaId,
        coords: newCoords,
      };
      
      if (health !== undefined) {
        updateData.health = health;
      }

      const result = await drizzle
        .update(characterTable)
        .set(updateData)
        .where(eq(characterTable.id, characterId));

      if (result.rowCount === 0) {
        throw new Error(`Character with id ${characterId} not found`);
      }
    },
  );
