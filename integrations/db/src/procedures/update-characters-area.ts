import { eq } from "drizzle-orm";
import { characterTable } from "../schema";
import type { CharacterId } from "@mp/world";
import type { AreaId } from "@mp/fixtures";
import { procedure } from "../utils/procedure";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";

export const updateCharactersArea = procedure()
  .input<{
    characterId: CharacterId;
    newAreaId: AreaId;
    newCoords: Vector<Tile>;
  }>()
  .query(
    async (drizzle, { characterId, newAreaId, newCoords }): Promise<void> => {
      const result = await drizzle
        .update(characterTable)
        .set({ areaId: newAreaId, coords: newCoords })
        .where(eq(characterTable.id, characterId));

      if (result.rowCount === 0) {
        throw new Error(`Character with id ${characterId} not found`);
      }
    },
  );
