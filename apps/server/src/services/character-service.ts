import type { UserId } from "@mp/auth";
import type { Rng } from "@mp/std";
import { assert, type Tile, type TimesPerSecond } from "@mp/std";
import { cardinalDirections } from "@mp/math";
import {
  type AreaLookup,
  type ActorModelLookup,
  type AppearanceTrait,
  type ActorModelId,
  type CharacterService,
  type UserService,
  Character,
} from "@mp/game/server";
import { eq } from "@mp/db";
import type { DbClient } from "../../../db/src/client";
import { characterTable } from "../../../db/src/schema";

export function createCharacterService(
  db: DbClient,
  userService: UserService,
  areas: AreaLookup,
  models: ActorModelLookup,
  rng: Rng,
): CharacterService {
  if (areas.size === 0) {
    throw new Error("CharacterService cannot be created without areas");
  }

  const defaultAreaId = [...areas.keys()][0];

  function getDefaultSpawnPoint() {
    const area = areas.get(defaultAreaId);
    if (!area) {
      throw new Error("Default area not found: " + defaultAreaId);
    }

    return {
      areaId: area.id,
      coords: area.start,
    };
  }

  return {
    getDefaultSpawnPoint,

    async getOrCreateCharacterForUser(userId: UserId): Promise<Character> {
      const findResult = await db
        .select()
        .from(characterTable)
        .where(eq(characterTable.userId, userId))
        .limit(1);

      const name = await userService.getName(userId);
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
          areaId: databaseFields.areaId,
          coords: databaseFields.coords,
          speed: databaseFields.speed,
          dir: rng.oneOf(cardinalDirections),
          desiredPortalId: undefined,
          moveTarget: undefined,
          path: undefined,
        },
      });
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
