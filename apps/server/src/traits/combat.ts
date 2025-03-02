import type { Rect } from "@mp/math";
import type { Tile } from "@mp/std";

export interface CombatTrait {
  hitBox: Rect<Tile>;
  health: number;
  maxHealth: number;
  attack: number;
}
