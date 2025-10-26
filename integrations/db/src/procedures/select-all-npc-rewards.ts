import type { NpcReward } from "@mp/game-shared";
import { and, eq, exists } from "drizzle-orm";
import type { DbClient } from "../client";
import { npcSpawnTable, npcRewardTable } from "../schema";
import { npcRewardsFromDbFields } from "../transform";
import type { AreaId } from "../types";

export async function selectAllNpcRewards(
  db: DbClient,
  areaId: AreaId,
): Promise<NpcReward[]> {
  const isRewardForThisAreaQuery = db
    .select()
    .from(npcSpawnTable)
    .where(
      and(
        eq(npcSpawnTable.areaId, areaId),
        eq(npcRewardTable.npcId, npcSpawnTable.npcId),
      ),
    );

  const rows = await db
    .select()
    .from(npcRewardTable)
    .where(exists(isRewardForThisAreaQuery));

  return rows.flatMap(npcRewardsFromDbFields);
}
