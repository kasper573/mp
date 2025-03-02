import type { Rect } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";
import type { TimeSpan } from "@mp/time";
import type { ActorId } from "../modules/world/WorldState";

export interface CombatTrait {
  hitBox: Rect<Tile>;
  health: number;
  maxHealth: number;
  attackDamage: number;
  attackSpeed: TimesPerSecond;
  attackRange: Tile;
  attackTargetId?: ActorId;
  lastAttack?: TimeSpan;
}
