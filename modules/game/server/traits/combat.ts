import { vecDistance, type Rect } from "@mp/math";
import { recordValues, type Tile, type TimesPerSecond } from "@mp/std";
import type { TickEventHandler, TimeSpan } from "@mp/time";
import type { PatchStateMachine, ReadonlyDeep } from "@mp/sync/server";
import type { GameState } from "../game-state";
import type { ActorId, Actor } from "./actor";

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

export function combatBehavior(
  state: PatchStateMachine<GameState>,
): TickEventHandler {
  return ({ totalTimeElapsed }) => {
    for (const actor of recordValues(state.actors())) {
      attemptAttack(actor, totalTimeElapsed);

      // Dying should stop all actions
      if (actor.health <= 0) {
        state.actors.update(actor.id, {
          health: 0, // Clamp
          path: undefined,
          moveTarget: undefined,
          attackTargetId: undefined,
        });
        continue;
      }
    }
  };

  function attemptAttack(actor: ReadonlyDeep<Actor>, currentTime: TimeSpan) {
    if (!actor.attackTargetId) {
      return; // Not attacking
    }

    const target = state.actors()[actor.attackTargetId];
    if (!target || !isTargetable(actor, target)) {
      state.actors.update(actor.id, { attackTargetId: undefined });
      return;
    }

    const distance = vecDistance(actor.coords, target.coords);
    if (distance > actor.attackRange + tileMargin) {
      // target too far away, move closer, but don't attack yet
      state.actors.update(actor.id, {
        moveTarget: target.coords,
      });
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

    state.actors.update(target.id, {
      health: target.health - actor.attackDamage,
    });

    state.actors.update(actor.id, {
      path: undefined, // stop moving when attacking
      lastAttack: currentTime,
    });
  }
}

const tileMargin = Math.sqrt(2); // diagonal distance between two tiles

export function isTargetable(
  actor: ReadonlyDeep<Actor>,
  target: ReadonlyDeep<Actor>,
): boolean {
  return target.areaId === actor.areaId && target.health > 0;
}
