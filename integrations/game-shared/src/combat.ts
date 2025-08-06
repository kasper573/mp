import type { Rect } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";
import { tracked } from "@mp/sync";
import type { TimeSpan } from "@mp/time";
import type { ActorId } from "./actor";
import { EncoderTag } from "./encoding";

@tracked(EncoderTag.CombatTrait)
export class CombatTrait {
  /**
   * Relative to the actor's position.
   */
  hitBox!: Rect<Tile>;
  health!: number;
  maxHealth!: number;
  attackDamage!: number;
  attackSpeed!: TimesPerSecond;
  attackRange!: Tile;
  attackTargetId?: ActorId;
  lastAttack?: TimeSpan;
}
