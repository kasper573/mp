import { eq } from "drizzle-orm";
import {
  type NpcSpawn,
  type Npc,
  type NpcService,
  type AreaLookup,
  deriveNpcSpawnsFromAreas,
} from "@mp/game/server";
import { npcSpawnTable, npcTable } from "../schema";
import type { DbClient } from "../client";

export function createNpcService(db: DbClient, areas: AreaLookup): NpcService {
  return {
    async getAllSpawnsAndTheirNpcs() {
      const result = await db
        .select()
        .from(npcSpawnTable)
        .leftJoin(npcTable, eq(npcSpawnTable.npcId, npcTable.id));

      const allNpcsAndSpawns = result.map(({ npc, npc_spawn: spawn }) => {
        if (!npc) {
          throw new Error(`NPC spawn ${spawn.id} has no NPC`);
        }
        return { spawn, npc } as { spawn: NpcSpawn; npc: Npc };
      });

      return [
        ...allNpcsAndSpawns,
        ...deriveNpcSpawnsFromAreas(
          areas,
          allNpcsAndSpawns.map(({ npc }) => npc),
        ),
      ];
    },
  };
}
