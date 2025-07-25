import type { UserId, UserIdentity } from "@mp/auth";
import type { Rng } from "@mp/std";
import { assert, type Tile, type TimesPerSecond } from "@mp/std";
import { cardinalDirections } from "@mp/math";
import type {
  AreaResource,
  GameStateLoader,
  Npc,
  NpcSpawn,
} from "@mp/game/server";
import {
  type ActorModelLookup,
  type AppearanceTrait,
  type ActorModelId,
  Character,
  deriveNpcSpawnsFromArea,
} from "@mp/game/server";
import type { DbClient } from "@mp/db";
import { characterTable, eq, npcSpawnTable, npcTable } from "@mp/db";
import { uniqueNamesGenerator, names } from "unique-names-generator";

export function createGameStateLoader(
  db: DbClient,
  area: AreaResource,
  models: ActorModelLookup,
  rng: Rng,
  includeNpcsDerivedFromTiled = true,
): GameStateLoader {
  const info = new Map<UserId, UserIdentity>();

  function getDefaultSpawnPoint() {
    return {
      areaId: area.id,
      coords: area.start,
    };
  }

  return {
    getDefaultSpawnPoint,

    async getOrCreateCharacterForUser(userId) {
      const findResult = await db
        .select()
        .from(characterTable)
        .where(eq(characterTable.userId, userId))
        .limit(1);

      const name = await this.getUserName(userId);
      let databaseFields = findResult.length > 0 ? findResult[0] : undefined;

      if (!databaseFields) {
        const input = {
          ...getDefaultSpawnPoint(),
          speed: 3 as Tile,
          health: 100,
          maxHealth: 100,
          attackDamage: 5,
          attackSpeed: 1.25 as TimesPerSecond,
          attackRange: 1 as Tile,
          userId,
          xp: 0,
          name,
          ...characterAppearance(),
        };

        const insertResult = await db
          .insert(characterTable)
          .values(input)
          .returning({ id: characterTable.id });

        const returned = insertResult.length > 0 ? insertResult[0] : undefined;
        if (!returned) {
          throw new Error("Failed to insert character");
        }

        databaseFields = { ...input, id: returned.id };
      }

      const model = assert(models.get(databaseFields.modelId));

      return new Character({
        appearance: {
          modelId: databaseFields.modelId,
          name: databaseFields.name,
          color: undefined,
          opacity: undefined,
        },
        identity: {
          id: databaseFields.id,
          userId: databaseFields.userId,
        },
        progression: {
          xp: databaseFields.xp,
        },
        combat: {
          attackDamage: databaseFields.attackDamage,
          attackRange: databaseFields.attackRange,
          attackSpeed: databaseFields.attackSpeed,
          health: databaseFields.health,
          maxHealth: databaseFields.maxHealth,
          hitBox: model.hitBox,
          attackTargetId: undefined,
          lastAttack: undefined,
        },
        movement: {
          coords: databaseFields.coords,
          speed: databaseFields.speed,
          dir: rng.oneOf(cardinalDirections),
          desiredPortalId: undefined,
          moveTarget: undefined,
          path: undefined,
        },
      });
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

      if (!includeNpcsDerivedFromTiled) {
        return allFromDB;
      }

      const allFromTiled = deriveNpcSpawnsFromArea(
        area,
        allFromDB.map(({ npc }) => npc),
      );

      return [...allFromDB, ...allFromTiled];
    },

    getUserName(userId) {
      const user = info.get(userId);
      if (!user) {
        throw new Error(`User with ID ${userId} not found in memory.`);
      }
      return Promise.resolve(
        user.name ??
          uniqueNamesGenerator({
            dictionaries: [names],
            seed: userId,
          }),
      );
    },
  };
}

function characterAppearance(): Omit<AppearanceTrait, "name"> {
  return {
    color: undefined,
    modelId: "adventurer" as ActorModelId,
    opacity: undefined,
  };
}
