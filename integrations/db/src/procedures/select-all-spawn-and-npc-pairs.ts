import type { NpcSpawn, NpcDefinition } from "@mp/game-shared";
import { eq } from "drizzle-orm";
import { npcSpawnTable, npcTable } from "../schema";
import type { AreaId } from "@mp/game-shared";
import { procedure } from "../utils/procedure";

export const selectAllSpawnAndNpcPairs = procedure()
  .input<AreaId>()
  .query(async (drizzle, areaId) => {
    const result = await drizzle
      .select()
      .from(npcSpawnTable)
      .leftJoin(npcTable, eq(npcSpawnTable.npcId, npcTable.id))
      .where(eq(npcSpawnTable.areaId, areaId));

    return result.map(
      ({ npc, npc_spawn: spawn }): { spawn: NpcSpawn; npc: NpcDefinition } => {
        if (!npc) {
          throw new Error(`NPC spawn ${spawn.id} has no NPC`);
        }
        return {
          npc,
          spawn: {
            ...spawn,
            coords: spawn.coords ?? undefined,
            randomRadius: spawn.randomRadius ?? undefined,
            patrol: spawn.patrol ?? undefined,
            npcType: spawn.npcType ?? undefined,
          },
        };
      },
    );
  });
