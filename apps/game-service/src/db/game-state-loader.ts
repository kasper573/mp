import type { DbClient } from "@mp/db";
import { characterTable, eq, npcSpawnTable, npcTable } from "@mp/db";
import type { AreaId, CharacterId } from "@mp/db/types";
import type { GameStateLoader } from "@mp/game/server";
import { deriveNpcSpawnsFromArea } from "@mp/game/server";
import type {
  ActorModelLookup,
  AreaResource,
  Character,
  Npc,
  NpcSpawn,
} from "@mp/game/shared";
import type { Rng } from "@mp/std";
import {
  characterFromDbFields,
  dbFieldsFromCharacter,
} from "./character-transform";

export function createGameStateLoader(
  db: DbClient,
  area: AreaResource,
  actorModels: ActorModelLookup,
  rng: Rng,
): GameStateLoader {
  return {
    getDefaultSpawnPoint() {
      return {
        areaId: "forest" as AreaId,
        coords: area.start,
      };
    },

    async saveCharacterToDb(character) {
      await db
        .update(characterTable)
        .set(dbFieldsFromCharacter(character))
        .where(eq(characterTable.id, character.identity.id));
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
