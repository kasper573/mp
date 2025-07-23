import { type Vector, type Rect, clamp } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";
import { TimeSpan, type TickEventHandler } from "@mp/time";
import type { GameState } from "../game-state/game-state";
import type { AreaLookup } from "../area/lookup";
import type { GameStateServer } from "../game-state/game-state-server";
import type { ActorId, Actor } from "../actor/actor";
import { findPathForSubject } from "./movement";
import { defineSyncComponent } from "@mp/sync";

export type CombatTrait = typeof CombatTrait.$infer;

export const CombatTrait = defineSyncComponent((builder) =>
  builder
    /**
     * Relative to the actor's position.
     */
    .add<"hitBox", Rect<Tile>>("hitBox")
    .add<"health", number>("health")
    .add<"maxHealth", number>("maxHealth")
    .add<"attackDamage", number>("attackDamage")
    .add<"attackSpeed", TimesPerSecond>("attackSpeed")
    .add<"attackRange", Tile>("attackRange")
    .add<"attackTargetId", ActorId | undefined>("attackTargetId", undefined)
    .add<"lastAttack", TimeSpan | undefined>("lastAttack", undefined),
);

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
        .filter((a) => a.type === "character" && a.combat.health > 0)) {
        actor.combat.health = clamp(
          actor.combat.health + 5,
          0,
          actor.combat.maxHealth,
        );
      }
    }

    for (const actor of state.actors.values()) {
      attemptAttack(actor, totalTimeElapsed);

      // Dying should stop all actions
      if (!actor.combat.health) {
        actor.combat.health = 0;
        actor.movement.path = undefined;
        actor.movement.moveTarget = undefined;
        actor.combat.attackTargetId = undefined;
      }
    }
  };

  function attemptAttack(actor: Actor, currentTime: TimeSpan) {
    if (!actor.combat.attackTargetId) {
      return; // Not attacking
    }

    const target = state.actors.get(actor.combat.attackTargetId);
    if (!target || !isTargetable(actor, target)) {
      actor.combat.attackTargetId = undefined;
      return;
    }

    // move closer to target if we're not in range to attack
    if (
      !canAttackFrom(
        actor.movement.coords,
        target.movement.coords,
        actor.combat.attackRange,
      )
    ) {
      if (!seemsToBeMovingTowards(actor, target.movement.coords)) {
        actor.movement.moveTarget = bestTileToAttackFrom(actor, target);
      }
      return;
    }

    if (actor.combat.lastAttack) {
      const attackDelay = 1 / actor.combat.attackSpeed;
      const timeSinceLastAttack = currentTime.subtract(actor.combat.lastAttack);
      if (timeSinceLastAttack.totalSeconds < attackDelay) {
        return; // attack on cooldown
      }
    }

    target.combat.health = Math.max(
      0,
      target.combat.health - actor.combat.attackDamage,
    );

    if (target.combat.health <= 0) {
      server.addEvent("actor.death", target.identity.id);
      if (actor.type === "character" && target.type === "npc") {
        actor.progression.xp += target.etc.xpReward;
      }
    }

    actor.movement.path = undefined; // stop moving when attacking
    actor.combat.lastAttack = currentTime;

    server.addEvent("movement.stop", actor.identity.id);
    server.addEvent(
      "combat.attack",
      { actorId: actor.identity.id, targetId: target.identity.id },
      { actors: [actor.identity.id, target.identity.id] },
    );
  }

  function bestTileToAttackFrom(
    actor: Actor,
    target: Actor,
  ): Vector<Tile> | undefined {
    const bestTile = findPathForSubject(
      actor.movement,
      areas,
      target.movement.coords,
    )?.find((tile) =>
      canAttackFrom(tile, target.movement.coords, actor.combat.attackRange),
    );
    return bestTile ?? target.movement.coords;
  }
}

function seemsToBeMovingTowards(actor: Actor, target: Vector<Tile>): boolean {
  return !!actor.movement.path?.findLast((tile) =>
    canAttackFrom(tile, target, actor.combat.attackRange),
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
  actor: Pick<Actor, "movement">,
  target: Pick<Actor, "movement" | "combat">,
): boolean {
  return (
    target.movement.areaId === actor.movement.areaId && target.combat.health > 0
  );
}
