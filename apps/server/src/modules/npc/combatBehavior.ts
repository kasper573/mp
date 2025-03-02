import type { PatchStateMachine, ReadonlyDeep } from "@mp/sync/server";
import type { TickEventHandler, TimeSpan } from "@mp/time";
import { recordValues } from "@mp/std";
import { vec_distance } from "@mp/math";
import type { Actor, WorldState } from "../world/WorldState";

export function combatBehavior(
  state: PatchStateMachine<WorldState>,
): TickEventHandler {
  return ({ totalTimeElapsed }) => {
    for (const actor of recordValues(state.actors())) {
      attemptAttack(actor, totalTimeElapsed);
      if (actor.health <= 0 && actor.type == "npc") {
        state.actors.remove(actor.id);
      }
    }
  };

  function attemptAttack(actor: ReadonlyDeep<Actor>, currentTime: TimeSpan) {
    if (!actor.attackTargetId) {
      return;
    }

    const target = state.actors()[actor.attackTargetId];
    if (!target) {
      return; // target doesnt exist
    }

    const distance = vec_distance(actor.coords, target.coords);
    if (distance > actor.attackRange + 1) {
      // too far away, move closer, but don't attack yet
      state.actors.update(actor.id, { moveTarget: target.coords });
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
      moveTarget: undefined,
      path: undefined,
      lastAttack: currentTime,
    });
  }
}
