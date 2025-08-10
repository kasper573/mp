import type { characterTable, npcRewardTable } from "@mp/db";
import type { ActorModelLookup, NpcReward } from "@mp/game-shared";
import { Character } from "@mp/game-shared";
import { cardinalDirections } from "@mp/math";
import type { Rng } from "@mp/std";
import { assert } from "@mp/std";

export function characterFromDbFields(
  fields: typeof characterTable.$inferSelect,
  modelLookup: ActorModelLookup,
  rng: Rng,
): Character {
  const model = assert(
    modelLookup.get(fields.modelId),
    `Actor model not found: ${fields.modelId}`,
  );

  return Character.create({
    type: "character",
    inventoryId: fields.inventoryId,
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
      alive: true,
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

export function npcRewardsFromDbFields(
  fields: typeof npcRewardTable.$inferSelect,
): NpcReward[] {
  const rewards: NpcReward[] = [];
  if (fields.xp !== null) {
    rewards.push({
      npcId: fields.npcId,
      type: "xp",
      xp: fields.xp,
    });
  }
  if (fields.itemId !== null) {
    rewards.push({
      npcId: fields.npcId,
      type: "item",
      itemId: fields.itemId,
    });
  }
  return rewards;
}
