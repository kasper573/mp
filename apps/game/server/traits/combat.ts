import { type Rect } from "@mp/math";
import { recordValues, type Tile, type TimesPerSecond } from "@mp/std";
import type { TickEventHandler, TimeSpan } from "@mp/time";
import type { PatchStateMachine, ReadonlyDeep } from "@mp/sync";
import type { GameState } from "../game-state";
import type { ActorId, Actor } from "./actor";

export interface CombatTrait {
  /**
   * Relative to the actor's position.
   */
  hitBox: Rect<Tile>;
  health: number;
  maxHealth: number;
  attackDamage: number;
  attackSpeed: TimesPerSecond;
  attackRange: Tile;
  attackTargetId?: ActorId;
  lastAttack?: TimeSpan;
}

export function combatBehavior(
  state: PatchStateMachine<GameState>,
): TickEventHandler {
  return ({ totalTimeElapsed }) => {
    for (const actor of recordValues(state.actors())) {
      attemptAttack(actor, totalTimeElapsed);

      // Dying should stop all actions
      if (!actor.health) {
        state.actors
          .update(actor.id)
          .set("health", 0) // Clamp
          .set("path", undefined)
          .set("moveTarget", undefined)
          .set("attackTargetId", undefined);
        continue;
      }
    }
  };

  function attemptAttack(actor: ReadonlyDeep<Actor>, currentTime: TimeSpan) {
    if (!actor.attackTargetId) {
      return; // Not attacking
    }

    const target = state.actors()[actor.attackTargetId] as Actor | undefined;
    if (!target || !isTargetable(actor, target)) {
      state.actors.update(actor.id).set("attackTargetId", undefined);
      return;
    }

    const distance = actor.coords.distance(target.coords);
    if (distance > actor.attackRange + tileMargin) {
      // target too far away, move closer, but don't attack yet
      state.actors.update(actor.id).set("moveTarget", target.coords);
      return;
    }

    if (actor.lastAttack) {
      const timeSinceLastAttack = currentTime.subtract(
        actor.lastAttack as TimeSpan,
      );
      if (timeSinceLastAttack.totalSeconds < actor.attackSpeed) {
        return; // attack on cooldown
      }
    }

    state.actors
      .update(target.id)
      .set("health", target.health - actor.attackDamage);

    state.actors
      .update(actor.id)
      .set("path", undefined) // stop moving when attacking
      .set("lastAttack", currentTime);
  }
}

// sqrt(2) is the diagonal distance between two tiles, which is slightly more than 1 tile,
// and in case someone has an attack range of 1, we need some error margin to allow diagonal attack.
const tileMargin = Math.sqrt(2) - 1;

export function isTargetable(
  actor: ReadonlyDeep<Actor>,
  target: ReadonlyDeep<Actor>,
): boolean {
  return target.areaId === actor.areaId && target.health > 0;
}
