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

export function createNpcService(
  db: DbClient,
  areas: AreaLookup,
  includeDerivedFromTiled = true,
): NpcService {
  return {
    async getAllSpawnsAndTheirNpcs() {
      const result = await db
        .select()
        .from(npcSpawnTable)
        .leftJoin(npcTable, eq(npcSpawnTable.npcId, npcTable.id));

      const allFromDB = result.map(({ npc, npc_spawn: spawn }) => {
        if (!npc) {
          throw new Error(`NPC spawn ${spawn.id} has no NPC`);
        }
        return { spawn, npc } as { spawn: NpcSpawn; npc: Npc };
      });

      if (!includeDerivedFromTiled) {
        return allFromDB;
      }

      const allFromTiled = deriveNpcSpawnsFromAreas(
        areas,
        allFromDB.map(({ npc }) => npc),
      );

      return [...allFromDB, ...allFromTiled];
    },
  };
}
