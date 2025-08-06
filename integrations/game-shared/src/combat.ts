import type { Rect } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";
import { object, value } from "@mp/sync";
import type { TimeSpan } from "@mp/time";
import type { ActorId } from "./actor";

export const CombatTrait = object({
  hitBox: value<Rect<Tile>>(),
  health: value<number>(),
  alive: value<boolean>(),
  maxHealth: value<number>(),
  attackDamage: value<number>(),
  attackSpeed: value<TimesPerSecond>(),
  attackRange: value<Tile>(),
  attackTargetId: value<ActorId | undefined>(),
  lastAttack: value<TimeSpan | undefined>(),
});

export type CombatTrait = typeof CombatTrait.$infer;
