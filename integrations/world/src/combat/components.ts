import { bool, f32, object, optional, transform, u32 } from "@rift/types";
import type { EntityId } from "@rift/core";
import type { Tile, TimesPerSecond } from "@mp/std";
import { Rect } from "@mp/math";

export const HitBox = transform(
  object({
    x: f32<Tile>(),
    y: f32<Tile>(),
    width: f32<Tile>(),
    height: f32<Tile>(),
  }),
  ({ x, y, width, height }) => new Rect(x, y, width, height),
  (r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }),
);

export const Combat = object({
  hitBox: HitBox,
  health: f32(),
  maxHealth: f32(),
  alive: bool(),
  attackDamage: f32(),
  attackSpeed: f32<TimesPerSecond>(),
  attackRange: f32<Tile>(),
  attackTargetId: optional(u32<EntityId>()),
  lastAttackMs: optional(f32()),
});

export const combatComponents = [Combat] as const;
