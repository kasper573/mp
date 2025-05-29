import type { Branded, Tile, TimesPerSecond } from "@mp/std";
import type { Path, Vector } from "@mp/math";
import type { MovementTrait } from "../traits/movement";
import type { ActorModelId } from "../traits/appearance";
import { type AppearanceTrait } from "../traits/appearance";
import type { CombatTrait } from "../traits/combat";
import type { AreaId } from "../../shared/area/area-id";

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
export interface NpcInstance
  extends Omit<Npc, "id">,
    MovementTrait,
    AppearanceTrait,
    CombatTrait {
  id: NpcInstanceId;
  npcId: NpcId;
  spawnId: NpcSpawnId;
  patrol?: Path<Tile>;
}

export type NpcInstanceId = Branded<string, "NPCInstanceId">;
