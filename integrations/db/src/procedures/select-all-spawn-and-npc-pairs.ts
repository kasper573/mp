import type { NpcSpawn, Npc } from "@mp/game-shared";
import { eq } from "drizzle-orm";
import { DbClient } from "../client";
import { npcSpawnTable, npcTable } from "../schema";
import type { AreaId } from "@mp/game-shared";

export async function selectAllSpawnAndNpcPairs(
  db: DbClient,
  areaId: AreaId,
): Promise<Array<{ spawn: NpcSpawn; npc: Npc }>> {
  const drizzle = DbClient.unwrap(db);
  const result = await drizzle
    .select()
    .from(npcSpawnTable)
    .leftJoin(npcTable, eq(npcSpawnTable.npcId, npcTable.id))
    .where(eq(npcSpawnTable.areaId, areaId));

  return result.map(({ npc, npc_spawn: spawn }) => {
    if (!npc) {
      throw new Error(`NPC spawn ${spawn.id} has no NPC`);
    }
    return { spawn, npc } as { spawn: NpcSpawn; npc: Npc };
  });
}
