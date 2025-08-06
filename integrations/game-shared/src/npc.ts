import type {
  ActorModelId,
  ItemId,
  NpcId,
  NpcSpawnId,
  NpcType,
} from "@mp/db/types";
import type { Path, Vector } from "@mp/math";
import type { Branded, Tile, TimesPerSecond } from "@mp/std";
import { object, value } from "@mp/sync";
import { AppearanceTrait } from "./appearance";
import { CombatTrait } from "./combat";
import { MovementTrait } from "./movement";

export interface Npc {
  id: NpcId;
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
  npcId: NpcId;
}

export interface NpcItemReward extends NpcRewardBase<"item"> {
  itemId: ItemId;
}

export interface NpcXpReward extends NpcRewardBase<"xp"> {
  xp: number;
}

export interface NpcSpawn {
  id: NpcSpawnId;
  count: number;
  npcId: NpcId;
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
  type: value<"npc">(),
  identity: object({
    id: value<NpcInstanceId>(),
    npcId: value<NpcId>(),
    spawnId: value<NpcSpawnId>(),
    npcType: value<NpcType>(),
  }),
  appearance: AppearanceTrait,
  movement: MovementTrait,
  combat: CombatTrait,
  etc: object({
    aggroRange: value<Tile>(),
    patrol: value<Path<Tile> | undefined>(),
  }),
});

export type NpcInstance = typeof NpcInstance.$infer;

export type NpcInstanceId = Branded<string, "NPCInstanceId">;
