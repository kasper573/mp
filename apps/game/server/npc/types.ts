import type { Branded, MinimalInput, Tile, TimesPerSecond } from "@mp/std";
import type { CardinalDirection, Path, Rect, Vector } from "@mp/math";
import { collect } from "@mp/sync";
import type { TimeSpan } from "@mp/time";
import type { MovementTrait } from "../traits/movement";
import type { ActorModelId } from "../traits/appearance";
import { type AppearanceTrait } from "../traits/appearance";
import type { CombatTrait } from "../traits/combat";
import type { AreaId } from "../../shared/area/area-id";
import type { ActorId } from "../traits/actor";
import * as patchOptimizers from "../patch-optimizers";

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

/**
 * One spawned instance of a specific NPC.
 * Does not get persisted in the database.
 */
export class NpcInstance
  implements Omit<Npc, "id">, MovementTrait, AppearanceTrait, CombatTrait
{
  @collect()
  accessor type = "npc" as const;
  @collect()
  accessor id!: NpcInstanceId;
  @collect()
  accessor npcId!: NpcId;
  @collect()
  accessor spawnId!: NpcSpawnId;
  @collect()
  accessor patrol!: Path<Tile> | undefined;
  @collect()
  accessor modelId!: ActorModelId;
  @collect()
  accessor name!: string;
  @collect()
  accessor speed!: Tile;
  @collect()
  accessor maxHealth!: number;
  @collect()
  accessor attackDamage!: number;
  @collect()
  accessor attackSpeed!: TimesPerSecond;
  @collect()
  accessor attackRange!: Tile;
  @collect()
  accessor npcType!: NpcType;
  @collect()
  accessor aggroRange!: Tile;
  @collect()
  accessor xpReward!: number;
  @collect(patchOptimizers.coords)
  accessor coords!: Vector<Tile>;
  @collect()
  accessor areaId!: AreaId;
  @collect()
  accessor moveTarget: Vector<Tile> | undefined;
  @collect(patchOptimizers.path)
  accessor path!: Path<Tile> | undefined;
  @collect()
  accessor dir!: CardinalDirection;
  @collect()
  accessor color!: number | undefined;
  @collect()
  accessor opacity: number | undefined;
  @collect()
  accessor hitBox!: Rect<Tile>;
  @collect()
  accessor health!: number;
  @collect()
  accessor attackTargetId!: ActorId | undefined;
  @collect()
  accessor lastAttack!: TimeSpan | undefined;

  private constructor() {}

  static create(data: Omit<MinimalInput<NpcInstance>, "type">): NpcInstance {
    const instance = new NpcInstance();
    instance.type = "npc";
    Object.assign(instance, data);
    return instance;
  }
}

export type NpcInstanceId = Branded<string, "NPCInstanceId">;
