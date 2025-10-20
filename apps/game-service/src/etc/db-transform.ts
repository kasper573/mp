import type {
  ActorModelLookup,
  ConsumableDefinition,
  EquipmentDefinition,
  NpcReward,
} from "@mp/game-shared";
import { Character } from "@mp/game-shared";
import { cardinalDirections } from "@mp/math";
import type { Rng, Tile, TimesPerSecond } from "@mp/std";
import { assert } from "@mp/std";
import type { UserId } from "@mp/oauth";
import type {
  ActorModelId,
  CharacterId,
  ConsumableDefinitionId,
  EquipmentDefinitionId,
  InventoryId,
  NpcId,
} from "@mp/db/types";
import type { Vector } from "@mp/math";

// Type for Character fields from database
export interface DbCharacterFields {
  characterId: CharacterId;
  userId: UserId;
  modelId: ActorModelId;
  name: string;
  inventoryId: InventoryId;
  xp: number;
  attackDamage: number;
  attackRange: Tile;
  attackSpeed: TimesPerSecond;
  health: number;
  maxHealth: number;
  coords: Vector<Tile>;
  speed: Tile;
}

// Type for Character insert/update fields
export interface DbCharacterUpdate {
  health: number;
  maxHealth: number;
  attackDamage: number;
  attackRange: Tile;
  attackSpeed: TimesPerSecond;
  coords: Vector<Tile>;
  speed: Tile;
  xp: number;
}

// Type for NPC reward fields from database
export interface DbNpcRewardFields {
  rewardId: string;
  npcId: NpcId;
  xp: number | null;
  consumableItemId: ConsumableDefinitionId | null | undefined;
  equipmentItemId: EquipmentDefinitionId | null | undefined;
  itemAmount: number | null;
}

// Type for Equipment Definition fields from database
export interface DbEquipmentDefinitionFields {
  definitionId: EquipmentDefinitionId;
  name: string;
  maxDurability: number;
}

// Type for Consumable Definition fields from database
export interface DbConsumableDefinitionFields {
  definitionId: ConsumableDefinitionId;
  name: string;
  maxStackSize: number;
}

export function characterFromDbFields(
  fields: DbCharacterFields,
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
      id: fields.characterId,
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

export function dbFieldsFromCharacter(char: Character): DbCharacterUpdate {
  return {
    ...char.combat,
    ...char.movement,
    ...char.progression,
  };
}

export function npcRewardsFromDbFields(fields: DbNpcRewardFields): NpcReward[] {
  const rewards: NpcReward[] = [];
  if (fields.xp !== null) {
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
  fields: DbEquipmentDefinitionFields,
): EquipmentDefinition {
  return { type: "equipment", id: fields.definitionId, ...fields };
}

export function consumableDefinitionFromDbFields(
  fields: DbConsumableDefinitionFields,
): ConsumableDefinition {
  return { type: "consumable", id: fields.definitionId, ...fields };
}
