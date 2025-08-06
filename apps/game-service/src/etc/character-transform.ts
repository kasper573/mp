import type { characterTable } from "@mp/db";
import type { ActorModelLookup } from "@mp/game-shared";
import { Character } from "@mp/game-shared";
import { cardinalDirections } from "@mp/math";
import type { Rng } from "@mp/std";
import { assert, typedAssign } from "@mp/std";

export function characterFromDbFields(
  fields: typeof characterTable.$inferSelect,
  modelLookup: ActorModelLookup,
  rng: Rng,
): Character {
  const model = assert(
    modelLookup.get(fields.modelId),
    `Actor model not found: ${fields.modelId}`,
  );

  return typedAssign(new Character(), {
    appearance: {
      modelId: fields.modelId,
      name: fields.name,
      color: undefined,
      opacity: undefined,
    },
    identity: {
      id: fields.id,
      userId: fields.userId,
    },
    progression: {
      xp: fields.xp,
    },
    combat: {
      attackDamage: fields.attackDamage,
      attackRange: fields.attackRange,
      attackSpeed: fields.attackSpeed,
      health: fields.health,
      maxHealth: fields.maxHealth,
      hitBox: model.hitBox,
      attackTargetId: undefined,
      lastAttack: undefined,
    },
    movement: {
      coords: fields.coords,
      speed: fields.speed,
      dir: rng.oneOf(cardinalDirections),
      desiredPortalId: undefined,
      moveTarget: undefined,
      path: undefined,
    },
  });
}

export function dbFieldsFromCharacter(char: Character) {
  return {
    ...char.combat,
    ...char.movement,
    ...char.progression,
  } satisfies Partial<typeof characterTable.$inferInsert>;
}
