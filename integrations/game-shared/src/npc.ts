import type { ActorModelId } from "./actor";
import type { Path, Vector } from "@mp/math";
import type { Branded, Tile, TimesPerSecond } from "@mp/std";
import { object, prop } from "@mp/sync";
import { AppearanceTrait } from "./appearance";
import { CombatTrait } from "./combat";
import { MovementTrait } from "./movement";
import type { ItemReference } from "./item";

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

export type NpcReward = NpcItemReward | NpcXpReward;

export interface NpcRewardBase<T extends string> {
  type: T;
  npcId: NpcDefinitionId;
}

export interface NpcItemReward extends NpcRewardBase<"item"> {
  reference: ItemReference;
  amount: number;
}

export interface NpcXpReward extends NpcRewardBase<"xp"> {
  xp: number;
}

export interface NpcSpawn {
  id: NpcSpawnId;
  count: number;
  npcId: NpcDefinitionId;
  coords?: Vector<Tile>;
  randomRadius?: number;
  patrol?: Path<Tile>;
  /**
   * Takes precedence over the npcType field from the NPC table.
   * If not set, the NPC's tables npcType will be used.
   */
  npcType?: NpcType;
}

/**
 * One spawned instance of a specific NPC.
 * Does not get persisted in the database.
 */
export const NpcInstance = object({
  type: prop<"npc">(),
  identity: object({
    id: prop<NpcInstanceId>(),
    npcId: prop<NpcDefinitionId>(),
    spawnId: prop<NpcSpawnId>(),
    npcType: prop<NpcType>(),
  }),
  appearance: AppearanceTrait,
  movement: MovementTrait,
  combat: CombatTrait,
  aggroRange: prop<Tile>(),
  patrol: prop<Path<Tile> | undefined>(),
});

export type NpcInstance = typeof NpcInstance.$infer;

export type NpcInstanceId = Branded<string, "NPCInstanceId">;
export type NpcDefinitionId = Branded<string, "NpcDefinitionId">;
export type NpcSpawnId = Branded<string, "NpcSpawnId">;
export type NpcRewardId = Branded<string, "NpcRewardId">;

export type NpcType = (typeof npcTypes)[number];
export const npcTypes = [
  /**
   * Just stands still and does nothing.
   */
  "static",
  /**
   * Patrols a path.
   */
  "patrol",
  /**
   * Will never aggro.
   */
  "pacifist",
  /**
   * Will aggro if attacked.
   */
  "defensive",
  /**
   * Will aggro if an actor considered an enemy is present.
   */
  "aggressive",
  /**
   * Will aggro if attacked or if an actor considered an ally is attacked.
   */
  "protective",
] as const;
