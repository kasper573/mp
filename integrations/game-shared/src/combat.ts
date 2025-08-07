import type { Rect } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";
import { object, prop } from "@mp/sync";
import type { TimeSpan } from "@mp/time";
import type { ActorId } from "./actor";

export const CombatTrait = object({
  hitBox: prop<Rect<Tile>>(),
  health: prop<number>(),
  alive: prop<boolean>(),
  maxHealth: prop<number>(),
  attackDamage: prop<number>(),
  attackSpeed: prop<TimesPerSecond>(),
  attackRange: prop<Tile>(),
  attackTargetId: prop<ActorId | undefined>(),
  lastAttack: prop<TimeSpan | undefined>(),
});

export type CombatTrait = typeof CombatTrait.$infer;
