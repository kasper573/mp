import type { Rect } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";
import { defineSyncComponent } from "@mp/sync";
import type { TimeSpan } from "@mp/time";
import type { ActorId } from "./actor";

export type CombatTrait = typeof CombatTrait.$infer;

export const CombatTrait = defineSyncComponent((builder) =>
  builder
    /**
     * Relative to the actor's position.
     */
    .add<Rect<Tile>>()("hitBox")
    .add<number>()("health")
    .add<number>()("maxHealth")
    .add<number>()("attackDamage")
    .add<TimesPerSecond>()("attackSpeed")
    .add<Tile>()("attackRange")
    .add<ActorId | undefined>()("attackTargetId")
    .add<TimeSpan | undefined>()("lastAttack"),
);
