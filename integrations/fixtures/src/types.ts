import type { Path, Vector } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";

// Branded string ID types (replacing @mp/validate branded types)
export type ActorModelId = string & { readonly __brand: "ActorModelId" };
export type AreaId = string & { readonly __brand: "AreaId" };
export type NpcDefinitionId = string & { readonly __brand: "NpcDefinitionId" };
export type NpcSpawnId = string & { readonly __brand: "NpcSpawnId" };
export type ConsumableDefinitionId = string & {
  readonly __brand: "ConsumableDefinitionId";
};
export type EquipmentDefinitionId = string & {
  readonly __brand: "EquipmentDefinitionId";
};

export type NpcType =
  | "static"
  | "patrol"
  | "pacifist"
  | "defensive"
  | "aggressive"
  | "protective";

export interface NpcDefinition {
  id: NpcDefinitionId;
  speed: Tile;
  maxHealth: number;
  attackDamage: number;
  attackSpeed: TimesPerSecond;
  attackRange: Tile;
  modelId: ActorModelId;
  name: string;
  npcType: NpcType;
  aggroRange: Tile;
}

export interface NpcSpawn {
  id: NpcSpawnId;
  areaId: AreaId;
  count: number;
  npcId: NpcDefinitionId;
  coords?: Vector<Tile>;
  randomRadius?: number;
  patrol?: Path<Tile>;
  npcType?: NpcType;
}

export type NpcReward = NpcItemReward | NpcXpReward;

export interface NpcItemReward {
  type: "item";
  npcId: NpcDefinitionId;
  itemType: "consumable" | "equipment";
  itemId: string;
  amount: number;
}

export interface NpcXpReward {
  type: "xp";
  npcId: NpcDefinitionId;
  xp: number;
}

export interface ConsumableDefinition {
  type: "consumable";
  id: ConsumableDefinitionId;
  name: string;
  maxStackSize: number;
}

export interface EquipmentDefinition {
  type: "equipment";
  id: EquipmentDefinitionId;
  name: string;
  maxDurability: number;
}

export type ItemDefinition = ConsumableDefinition | EquipmentDefinition;

export interface CharacterTemplate {
  speed: Tile;
  health: number;
  maxHealth: number;
  attackDamage: number;
  attackSpeed: TimesPerSecond;
  attackRange: Tile;
  modelId: ActorModelId;
  xp: number;
}

export interface AreaDefinition {
  id: AreaId;
  tiledFile: string;
}

export const clientViewDistance = {
  renderedTileCount: 24 as Tile,
  networkFogOfWarTileCount: 32 as Tile,
};
