import type { Branded, Tile, TimesPerSecond } from "@mp/std";
import type { Path, Vector } from "@mp/math";
import type { SyncComponent } from "@mp/sync";
import { defineSyncComponent } from "@mp/sync";

import { MovementTrait } from "../traits/movement";
import type { ActorModelId } from "../traits/appearance";
import { AppearanceTrait } from "../traits/appearance";
import { CombatTrait } from "../traits/combat";

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

export interface NpcInstanceInit {
  identity: NpcInstanceIdentity;
  appearance: AppearanceTrait;
  movement: MovementTrait;
  combat: CombatTrait;
  etc: NpcEtc;
}

export type NpcInstanceIdentity = typeof NpcInstanceIdentity.$infer;

const NpcInstanceIdentity = defineSyncComponent((builder) =>
  builder
    .add<NpcInstanceId>()("id")
    .add<NpcId>()("npcId")
    .add<NpcSpawnId>()("spawnId")
    .add<NpcType>()("npcType"),
);

export type NpcEtc = typeof NpcEtc.$infer;

const NpcEtc = defineSyncComponent((builder) =>
  builder
    .add<number>()("xpReward")
    .add<Tile>()("aggroRange")
    .add<Path<Tile> | undefined>()("patrol"),
);

export const NpcInstanceCommons = defineSyncComponent((builder) => builder);

/**
 * One spawned instance of a specific NPC.
 * Does not get persisted in the database.
 */
export class NpcInstance extends NpcInstanceCommons {
  readonly type = "npc" as const;
  readonly identity: SyncComponent<NpcInstanceIdentity>;
  readonly appearance: SyncComponent<AppearanceTrait>;
  readonly movement: SyncComponent<MovementTrait>;
  readonly combat: SyncComponent<CombatTrait>;
  readonly etc: SyncComponent<NpcEtc>;

  alive = computed(() => this.combat.health > 0);

  constructor(init: NpcInstanceInit) {
    super({});
    this.identity = new NpcInstanceIdentity(init.identity);
    this.appearance = new AppearanceTrait(init.appearance);
    this.movement = new MovementTrait(init.movement);
    this.combat = new CombatTrait(init.combat);
    this.etc = new NpcEtc(init.etc);
  }
}

export type NpcInstanceId = Branded<string, "NPCInstanceId">;
