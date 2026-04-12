import type { Path, Vector } from "@mp/math";
import type { Branded, Tile, TimesPerSecond } from "@mp/std";

export type ActorModelId = Branded<string, "ActorModelId">;
export type AreaId = Branded<string, "AreaId">;
export type NpcDefinitionId = Branded<string, "NpcDefinitionId">;
export type NpcSpawnId = Branded<string, "NpcSpawnId">;
export type ConsumableDefinitionId = Branded<string, "ConsumableDefinitionId">;
export type EquipmentDefinitionId = Branded<string, "EquipmentDefinitionId">;
export type ItemDefinitionId = ConsumableDefinitionId | EquipmentDefinitionId;

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
  itemId: ItemDefinitionId;
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
