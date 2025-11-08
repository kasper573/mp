import type { NpcReward } from "@mp/game-shared";
import { and, eq, exists } from "drizzle-orm";
import { npcSpawnTable, npcRewardTable } from "../schema";
import { npcRewardsFromDbFields } from "../utils/transform";
import type { AreaId } from "@mp/game-shared";
import { procedure } from "../utils/procedure";

export const selectAllNpcRewards = procedure()
  .input<AreaId>()
  .query(async (drizzle, areaId): Promise<NpcReward[]> => {
    const isRewardForThisAreaQuery = drizzle
      .select()
      .from(npcSpawnTable)
      .where(
        and(
          eq(npcSpawnTable.areaId, areaId),
          eq(npcRewardTable.npcId, npcSpawnTable.npcId),
        ),
      );

    const rows = await drizzle
      .select()
      .from(npcRewardTable)
      .where(exists(isRewardForThisAreaQuery));

    return rows.flatMap(npcRewardsFromDbFields);
  });
