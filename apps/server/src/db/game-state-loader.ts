import type {
  AreaResource,
  GameStateLoader,
  Npc,
  NpcSpawn,
} from "@mp/game/server";
import { deriveNpcSpawnsFromArea } from "@mp/game/server";
import type { DbClient } from "@mp/db-client";
import { eq, npcSpawnTable, npcTable } from "@mp/db-client";

export function createGameStateLoader(
  db: DbClient,
  area: AreaResource,
  includeNpcsDerivedFromTiled = true,
): GameStateLoader {
  function getDefaultSpawnPoint() {
    return {
      areaId: area.id,
      coords: area.start,
    };
  }

  return {
    getDefaultSpawnPoint,

    async getAllSpawnsAndTheirNpcs() {
      const result = await db
        .select()
        .from(npcSpawnTable)
        .leftJoin(npcTable, eq(npcSpawnTable.npcId, npcTable.id))
        .where(eq(npcSpawnTable.areaId, area.id));

      const allFromDB = result.map(({ npc, npc_spawn: spawn }) => {
        if (!npc) {
          throw new Error(`NPC spawn ${spawn.id} has no NPC`);
        }
        return { spawn, npc } as { spawn: NpcSpawn; npc: Npc };
      });

      if (!includeNpcsDerivedFromTiled) {
        return allFromDB;
      }

      const allFromTiled = deriveNpcSpawnsFromArea(
        area,
        allFromDB.map(({ npc }) => npc),
      );

      return [...allFromDB, ...allFromTiled];
    },
  };
}
