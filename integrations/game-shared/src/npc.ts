import type {
  ActorModelId,
  ItemId,
  NpcId,
  NpcSpawnId,
  NpcType,
} from "@mp/db/types";
import type { Path, Vector } from "@mp/math";
import type { Branded, Tile, TimesPerSecond } from "@mp/std";
import { tracked } from "@mp/sync";
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

export interface NpcInstanceInit {
  identity: NpcInstanceIdentity;
  appearance: AppearanceTrait;
  movement: MovementTrait;
  combat: CombatTrait;
  etc: NpcEtc;
}

export interface NpcInstanceIdentity {
  readonly id: NpcInstanceId;
  readonly npcId: NpcId;
  readonly spawnId: NpcSpawnId;
  readonly npcType: NpcType;
}

@tracked()
export class NpcEtc {
  aggroRange = 0 as Tile;
  patrol?: Path<Tile>;
}

/**
 * One spawned instance of a specific NPC.
 * Does not get persisted in the database.
 */
@tracked()
export class NpcInstance {
  readonly type = "npc" as const;
  readonly identity!: NpcInstanceIdentity;
  readonly appearance = new AppearanceTrait();
  readonly movement = new MovementTrait();
  readonly combat = new CombatTrait();
  readonly etc = new NpcEtc();

  get alive() {
    return this.combat.health > 0;
  }
}

export type NpcInstanceId = Branded<string, "NPCInstanceId">;
