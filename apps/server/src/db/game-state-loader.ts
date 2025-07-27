import type {
  ActorModelLookup,
  AreaId,
  AreaResource,
  Character,
  CharacterId,
  GameStateLoader,
  Npc,
  NpcSpawn,
} from "@mp/game/server";
import { deriveNpcSpawnsFromArea } from "@mp/game/server";
import type { DbClient } from "@mp/db-client";
import { characterTable, eq, npcSpawnTable, npcTable } from "@mp/db-client";
import { characterFromDbFields } from "./character-transform";
import type { Rng } from "@mp/std";

export function createGameStateLoader(
  db: DbClient,
  area: AreaResource,
  actorModels: ActorModelLookup,
  rng: Rng,
): GameStateLoader {
  return {
    getDefaultSpawnPoint() {
      return {
        areaId: area.id,
        coords: area.start,
      };
    },

    async assignAreaIdToCharacterInDb(
      characterId: CharacterId,
      newAreaId: AreaId,
    ): Promise<Character> {
      const result = await db.transaction(async (tx) => {
        await tx
          .update(characterTable)
          .set({ areaId: newAreaId })
          .where(eq(characterTable.id, characterId));

        return tx
          .select()
          .from(characterTable)
          .where(eq(characterTable.id, characterId))
          .limit(1);
      });

      if (result.length === 0) {
        throw new Error(`Character with id ${characterId} not found`);
      }

      return characterFromDbFields(result[0], actorModels, rng);
    },

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

      const allFromTiled = deriveNpcSpawnsFromArea(
        area,
        allFromDB.map(({ npc }) => npc),
      );

      return [...allFromDB, ...allFromTiled];
    },
  };
}
