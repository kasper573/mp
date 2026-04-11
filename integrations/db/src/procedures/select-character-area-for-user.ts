import type { UserId } from "@mp/auth";
import { and, eq } from "drizzle-orm";
import type { AreaId, CharacterId } from "@mp/game-shared";
import { characterTable } from "../schema";
import { procedure } from "../utils/procedure";

export const selectCharacterAreaForUser = procedure()
  .input<{ userId: UserId; characterId: CharacterId }>()
  .query(async (drizzle, { userId, characterId }) => {
    const rows = await drizzle
      .select({ areaId: characterTable.areaId })
      .from(characterTable)
      .where(
        and(
          eq(characterTable.userId, userId),
          eq(characterTable.id, characterId),
        ),
      )
      .limit(1);
    return rows.length > 0 ? (rows[0].areaId as AreaId) : undefined;
  });
