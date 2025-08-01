import type {
  ActorModelId,
  ItemId,
  NpcId,
  NpcSpawnId,
  NpcType,
} from "@mp/db/types";
import type { Path, Vector } from "@mp/math";
import { computed } from "@mp/state";
import type { Branded, Tile, TimesPerSecond } from "@mp/std";
import type { SyncComponent } from "@mp/sync";
import { defineSyncComponent } from "@mp/sync";
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
  builder.add<Tile>()("aggroRange").add<Path<Tile> | undefined>()("patrol"),
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
