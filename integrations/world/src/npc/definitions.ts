import type { Path, Vector } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";
import type { ItemReference } from "../item/definitions";
import type {
  ActorModelId,
  AreaId,
  NpcDefinitionId,
  NpcRewardId,
  NpcSpawnId,
} from "../identity/ids";

export const npcTypes = [
  "static",
  "patrol",
  "pacifist",
  "defensive",
  "aggressive",
  "protective",
] as const;

export type NpcType = (typeof npcTypes)[number];

export interface NpcDefinition {
  readonly id: NpcDefinitionId;
  readonly speed: Tile;
  readonly maxHealth: number;
  readonly attackDamage: number;
  readonly attackSpeed: TimesPerSecond;
  readonly attackRange: Tile;
  readonly modelId: ActorModelId;
  readonly name: string;
  readonly npcType: NpcType;
  readonly aggroRange: Tile;
}

export interface NpcSpawn {
  readonly id: NpcSpawnId;
  readonly count: number;
  readonly npcId: NpcDefinitionId;
  readonly areaId: AreaId;
  readonly coords?: Vector<Tile>;
  readonly randomRadius?: number;
  readonly patrol?: Path<Tile>;
  readonly npcType?: NpcType;
}

export type NpcReward = NpcItemReward | NpcXpReward;

interface NpcRewardBase<T extends string> {
  readonly id: NpcRewardId;
  readonly type: T;
  readonly npcId: NpcDefinitionId;
}

export interface NpcItemReward extends NpcRewardBase<"item"> {
  readonly reference: ItemReference;
  readonly amount: number;
}

export interface NpcXpReward extends NpcRewardBase<"xp"> {
  readonly xp: number;
}
