import { type Vector, type Rect, clamp } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";
import { TimeSpan, type TickEventHandler } from "@mp/time";
import type { GameState } from "../game-state/game-state";
import type { AreaLookup } from "../area/lookup";
import type { GameStateServer } from "../game-state/game-state-server";
import type { ActorId, Actor } from "../actor/actor";
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

const hpRegenInterval = TimeSpan.fromSeconds(10);

export function combatBehavior(
  state: GameState,
  server: GameStateServer,
  areas: AreaLookup,
): TickEventHandler {
  let nextHpRegenTime = TimeSpan.fromSeconds(0);
  return ({ totalTimeElapsed }) => {
    // Give all alive characters some health every so often
    if (totalTimeElapsed.compareTo(nextHpRegenTime) > 0) {
      nextHpRegenTime = totalTimeElapsed.add(hpRegenInterval);
      for (const actor of state.actors
        .values()
        .filter((a) => a.type === "character" && a.health > 0)) {
        actor.health = clamp(actor.health + 5, 0, actor.maxHealth);
      }
    }

    for (const actor of state.actors.values()) {
      attemptAttack(actor, totalTimeElapsed);

      // Dying should stop all actions
      if (!actor.health) {
        actor.health = 0;
        actor.path = undefined;
        actor.moveTarget = undefined;
        actor.attackTargetId = undefined;
      }
    }
  };

  function attemptAttack(actor: Actor, currentTime: TimeSpan) {
    if (!actor.attackTargetId) {
      return; // Not attacking
    }

    const target = state.actors.get(actor.attackTargetId);
    if (!target || !isTargetable(actor, target)) {
      actor.attackTargetId = undefined;
      return;
    }

    // move closer to target if we're not in range to attack
    if (!canAttackFrom(actor.coords, target.coords, actor.attackRange)) {
      if (!seemsToBeMovingTowards(actor, target.coords)) {
        actor.moveTarget = bestTileToAttackFrom(actor, target);
      }
      return;
    }

    if (actor.lastAttack) {
      const attackDelay = 1 / actor.attackSpeed;
      const timeSinceLastAttack = currentTime.subtract(actor.lastAttack);
      if (timeSinceLastAttack.totalSeconds < attackDelay) {
        return; // attack on cooldown
      }
    }

    target.health = Math.max(0, target.health - actor.attackDamage);

    if (target.health <= 0) {
      server.addEvent("actor.death", target.id);
      if (actor.type === "character" && target.type === "npc") {
        actor.xp += target.xpReward;
      }
    }

    actor.path = undefined; // stop moving when attacking
    actor.lastAttack = currentTime;

    server.addEvent("movement.stop", actor.id);
    server.addEvent(
      "combat.attack",
      { actorId: actor.id, targetId: target.id },
      { actors: [actor.id, target.id] },
    );
  }

  function bestTileToAttackFrom(
    actor: Actor,
    target: Actor,
  ): Vector<Tile> | undefined {
    const bestTile = findPathForSubject(actor, areas, target.coords)?.find(
      (tile) => canAttackFrom(tile, target.coords, actor.attackRange),
    );
    return bestTile ?? target.coords;
  }
}

function seemsToBeMovingTowards(actor: Actor, target: Vector<Tile>): boolean {
  return !!actor.path?.findLast((tile) =>
    canAttackFrom(tile, target, actor.attackRange),
  );
}

function canAttackFrom(
  fromTile: Vector<Tile>,
  targetTile: Vector<Tile>,
  attackRange: Tile,
) {
  return fromTile.isWithinDistance(targetTile, attackRange + tileMargin);
}

// sqrt(2) is the diagonal distance between two tiles, which is slightly more than 1 tile,
// and in case someone has an attack range of 1, we need some error margin to allow diagonal attack.
const tileMargin = Math.sqrt(2) - 1;

export function isTargetable(
  actor: Pick<Actor, "areaId">,
  target: Pick<Actor, "areaId" | "health">,
): boolean {
  return target.areaId === actor.areaId && target.health > 0;
}
