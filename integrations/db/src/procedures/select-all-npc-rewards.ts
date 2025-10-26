import type { NpcReward } from "@mp/game-shared";
import { and, eq, exists } from "drizzle-orm";
import { DbClient } from "../client";
import { npcSpawnTable, npcRewardTable } from "../schema";
import { npcRewardsFromDbFields } from "../transform";
import type { AreaId } from "@mp/game-shared";

export async function selectAllNpcRewards(
  db: DbClient,
  areaId: AreaId,
): Promise<NpcReward[]> {
  const drizzle = DbClient.unwrap(db);
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
}
