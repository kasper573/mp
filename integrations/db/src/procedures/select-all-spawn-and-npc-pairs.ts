import type { NpcSpawn, NpcDefinition } from "@mp/game-shared";
import { eq } from "drizzle-orm";
import { npcSpawnTable, npcTable } from "../schema";
import type { AreaId } from "@mp/game-shared";
import { procedure } from "../utils/procedure";

export const selectAllSpawnAndNpcPairs = procedure()
  .input<AreaId>()
  .query(
    async (
      drizzle,
      areaId,
    ): Promise<Array<{ spawn: NpcSpawn; npc: NpcDefinition }>> => {
      const result = await drizzle
        .select()
        .from(npcSpawnTable)
        .leftJoin(npcTable, eq(npcSpawnTable.npcId, npcTable.id))
        .where(eq(npcSpawnTable.areaId, areaId));

      return result.map(({ npc, npc_spawn: spawn }) => {
        if (!npc) {
          throw new Error(`NPC spawn ${spawn.id} has no NPC`);
        }
        return { spawn, npc } as { spawn: NpcSpawn; npc: NpcDefinition };
      });
    },
  );
