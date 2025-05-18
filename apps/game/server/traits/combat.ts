import type { Vector, Rect } from "@mp/math";
import { nearestCardinalDirection } from "@mp/math";
import { type Tile, type TimesPerSecond } from "@mp/std";
import type { TickEventHandler, TimeSpan } from "@mp/time";
import type { ReadonlyDeep } from "@mp/sync";
import type { GameStateMachine } from "../game-state";
import type { AreaLookup } from "../area/lookup";
import type { ActorId, Actor } from "./actor";
import { findPathForSubject } from "./movement";

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
  state: GameStateMachine,
  areas: AreaLookup,
): TickEventHandler {
  return ({ totalTimeElapsed }) => {
    for (const actor of state.actors.values()) {
      attemptAttack(actor, totalTimeElapsed);

      // Dying should stop all actions
      if (!actor.health) {
        state.actors.update(actor.id, (update) =>
          update
            .add("health", 0) // Clamp
            .add("path", undefined)
            .add("moveTarget", undefined)
            .add("attackTargetId", undefined),
        );

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
      state.actors.update(actor.id, (u) => u.add("attackTargetId", undefined));
      return;
    }

    // move closer to target if we're not in range to attack
    if (!canAttackFrom(actor.coords, target.coords, actor.attackRange)) {
      if (!seemsToBeMovingTowards(actor, target.coords)) {
        const attackFromTile = bestTileToAttackFrom(actor, target);
        state.actors.update(actor.id, (u) =>
          u.add("moveTarget", attackFromTile),
        );
      }
      return;
    }

    // Correct direction if we're not facing the target
    const direction = nearestCardinalDirection(
      actor.coords.angle(target.coords),
    );
    if (direction !== actor.dir) {
      state.actors.update(actor.id, (u) => u.add("dir", direction));
    }

    if (actor.lastAttack) {
      const timeSinceLastAttack = currentTime.subtract(
        actor.lastAttack as TimeSpan,
      );
      if (timeSinceLastAttack.totalSeconds < actor.attackSpeed) {
        return; // attack on cooldown
      }
    }

    state.actors.update(target.id, (update) =>
      update.add("health", Math.max(0, target.health - actor.attackDamage)),
    );

    state.actors.update(actor.id, (update) =>
      update
        .add("path", undefined) // stop moving when attacking
        .add("lastAttack", currentTime),
    );

    state.$event(
      "combat.attack",
      { actorId: actor.id, targetId: target.id },
      { actors: [actor.id, target.id] },
    );
  }

  function bestTileToAttackFrom(
    actor: ReadonlyDeep<Actor>,
    target: ReadonlyDeep<Actor>,
  ): Vector<Tile> {
    const adjacentTile = findPathForSubject(actor, areas, target.coords)?.find(
      (tile) => canAttackFrom(tile, target.coords, actor.attackRange),
    );
    return adjacentTile ?? actor.coords;
  }
}

function seemsToBeMovingTowards(
  actor: ReadonlyDeep<Actor>,
  target: Vector<Tile>,
): boolean {
  return !!actor.path?.findLast((tile) =>
    canAttackFrom(tile, target, actor.attackRange),
  );
}

function canAttackFrom(
  fromTile: Vector<Tile>,
  targetTile: Vector<Tile>,
  attackRange: Tile,
) {
  const distance = fromTile.distance(targetTile);
  return distance <= attackRange + tileMargin;
}

// sqrt(2) is the diagonal distance between two tiles, which is slightly more than 1 tile,
// and in case someone has an attack range of 1, we need some error margin to allow diagonal attack.
const tileMargin = Math.sqrt(2) - 1;

export function isTargetable(
  actor: ReadonlyDeep<Pick<Actor, "areaId">>,
  target: ReadonlyDeep<Pick<Actor, "areaId" | "health">>,
): boolean {
  return target.areaId === actor.areaId && target.health > 0;
}
