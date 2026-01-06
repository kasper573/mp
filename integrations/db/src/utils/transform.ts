import type {
  ActorModelLookup,
  ConsumableDefinition,
  EquipmentDefinition,
  NpcReward,
} from "@mp/game-shared";
import { Character } from "@mp/game-shared";
import { assert } from "@mp/std";
import type {
  characterTable,
  npcRewardTable,
  equipmentDefinitionTable,
  consumableDefinitionTable,
} from "../schema";

// Transformer functions to and from database and game state

export function characterFromDbFields(
  fields: typeof characterTable.$inferSelect,
  modelLookup: ActorModelLookup,
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
      alive: fields.health > 0,
      hitBox: model.hitBox,
      attackTargetId: undefined,
      lastAttack: undefined,
    },
    movement: {
      coords: fields.coords,
      speed: fields.speed,
      dir: "s",
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
  if (fields.consumableItemId !== null) {
    rewards.push({
      npcId: fields.npcId,
      type: "item",
      reference: { type: "consumable", definitionId: fields.consumableItemId },
      amount: assert(
        fields.itemAmount,
        "Item amount must be defined alongside an item reference",
      ),
    });
  }
  if (fields.equipmentItemId !== null) {
    rewards.push({
      npcId: fields.npcId,
      type: "item",
      reference: { type: "equipment", definitionId: fields.equipmentItemId },
      amount: assert(
        fields.itemAmount,
        "Item amount must be defined alongside an item reference",
      ),
    });
  }
  return rewards;
}

export function equipmentDefinitionFromDbFields(
  fields: typeof equipmentDefinitionTable.$inferSelect,
): EquipmentDefinition {
  return { type: "equipment", ...fields };
}

export function consumableDefinitionFromDbFields(
  fields: typeof consumableDefinitionTable.$inferSelect,
): ConsumableDefinition {
  return { type: "consumable", ...fields };
}
