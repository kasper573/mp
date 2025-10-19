import type {
  Character as CharacterEntity,
  ConsumableDefinition as ConsumableDefinitionEntity,
  EquipmentDefinition as EquipmentDefinitionEntity,
  NpcReward as NpcRewardEntity,
} from "@mp/db";
import type {
  ActorModelLookup,
  ConsumableDefinition,
  EquipmentDefinition,
  NpcReward,
} from "@mp/game-shared";
import { Character } from "@mp/game-shared";
import { cardinalDirections } from "@mp/math";
import type { Rng } from "@mp/std";
import { assert } from "@mp/std";

export function characterFromDbFields(
  fields: CharacterEntity,
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
      coords: fields.coords as unknown as typeof fields.coords,
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
  } satisfies Partial<CharacterEntity>;
}

export function npcRewardsFromDbFields(fields: NpcRewardEntity): NpcReward[] {
  const rewards: NpcReward[] = [];
  if (fields.xp !== null && fields.xp !== undefined) {
    rewards.push({
      npcId: fields.npcId,
      type: "xp",
      xp: fields.xp,
    });
  }
  if (
    fields.consumableItemId !== null &&
    fields.consumableItemId !== undefined
  ) {
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
  if (fields.equipmentItemId !== null && fields.equipmentItemId !== undefined) {
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
  fields: EquipmentDefinitionEntity,
): EquipmentDefinition {
  return { type: "equipment", ...fields };
}

export function consumableDefinitionFromDbFields(
  fields: ConsumableDefinitionEntity,
): ConsumableDefinition {
  return { type: "consumable", ...fields };
}
