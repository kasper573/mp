import { eq } from "drizzle-orm";
import type { NpcSpawn, Npc, NpcService } from "@mp/game";
import { npcSpawnTable, npcTable } from "../schema";
import type { DbClient } from "../client";

export function createNpcService(db: DbClient): NpcService {
  return {
    async getAllSpawnsAndTheirNpcs() {
      const result = await db
        .select()
        .from(npcSpawnTable)
        .leftJoin(npcTable, eq(npcSpawnTable.npcId, npcTable.id));

      return result.map(({ npc, npc_spawn: spawn }) => {
        if (!npc) {
          throw new Error(`NPC spawn ${spawn.id} has no NPC`);
        }
        return { spawn, npc } as { spawn: NpcSpawn; npc: Npc };
      });
    },
  };
}
