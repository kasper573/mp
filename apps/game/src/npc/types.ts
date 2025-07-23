import type { Branded, Tile, TimesPerSecond } from "@mp/std";
import type { Path, Vector } from "@mp/math";
import { createSyncComponent, SyncEntity } from "@mp/sync";

import { createMovementTrait, type MovementTrait } from "../traits/movement";
import { createAppearanceTrait, type ActorModelId } from "../traits/appearance";
import type { AppearanceTrait } from "../traits/appearance";
import { createCombatTrait, type CombatTrait } from "../traits/combat";
import type { AreaId } from "../area/area-id";

import { computed } from "@mp/state";

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
  xpReward: number;
}

export type NpcSpawnId = Branded<string, "NpcSpawnId">;

export interface NpcSpawn {
  id: NpcSpawnId;
  count: number;
  areaId: AreaId;
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

export type NpcId = Branded<string, "NPCId">;

export interface NpcInstanceIdentity {
  id: NpcInstanceId;
  npcId: NpcId;
  spawnId: NpcSpawnId;
  npcType: NpcType;
}

/**
 * TODO Should be replaced by some better solution.
 * Either create better named traits or allow subclassing traits ie NpcCombatTrait from CombatTrait.
 * @deprecated This is lazy af.
 */
export interface NpcEtc {
  xpReward: number;
  patrol?: Path<Tile>;
  aggroRange: Tile;
}

export type NpcInstanceInit = Pick<
  NpcInstance,
  "identity" | "appearance" | "movement" | "combat" | "etc"
>;

/**
 * One spawned instance of a specific NPC.
 * Does not get persisted in the database.
 */
export class NpcInstance extends SyncEntity {
  readonly type = "npc" as const;
  readonly identity: NpcInstanceIdentity;
  readonly appearance: AppearanceTrait;
  readonly movement: MovementTrait;
  readonly combat: CombatTrait;
  readonly etc: NpcEtc;

  alive = computed(() => this.combat.health > 0);

  constructor(init: NpcInstanceInit) {
    super();
    this.type = "npc";
    this.identity = createSyncComponent(init.identity);
    this.appearance = createAppearanceTrait(init.appearance);
    this.movement = createMovementTrait(init.movement);
    this.combat = createCombatTrait(init.combat);
    this.etc = createSyncComponent(init.etc);
  }
}

export type NpcInstanceId = Branded<string, "NPCInstanceId">;
