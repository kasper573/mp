import { TimeSpan } from "@mp/time";
import type { FrameCallbackOptions } from "@mp/engine";
import type { EventAccessFn, Patch } from "@mp/sync";
import { applyOperation, applyPatch, PatchType, SyncMap } from "@mp/sync";
import { isPathEqual, nearestCardinalDirection } from "@mp/math";
import { typedKeys } from "@mp/std";
import { moveAlongPath } from "../area/move-along-path";
import type { GameStateEvents } from "./game-state-events";
import type { GameState } from "./game-state";
import type { Actor, ActorId } from "../actor/actor";
import type { MovementTrait } from "../traits/movement";

export class OptimisticGameState implements GameState {
  actors: GameState["actors"] = new SyncMap();

  constructor(private settings: () => OptimisticGameStateSettings) {}

  frameCallback = (opt: FrameCallbackOptions) => {
    if (!this.settings().useInterpolator) {
      return;
    }

    for (const actor of this.actors.values()) {
      if (actor.movement.path && actor.combat.health > 0) {
        moveAlongPath(actor.movement, opt.timeSinceLastFrame);

        // Face the direction the actor is moving towards
        const target = actor.movement.path?.[0];
        if (target) {
          actor.movement.dir = nearestCardinalDirection(
            actor.movement.coords.angle(target),
          );
        }
      }
    }

    this.actors.flush();
  };

  applyPatch = (patch: Patch, events: EventAccessFn<GameStateEvents>) => {
    if (this.settings().usePatchOptimizer) {
      applyPatchOptimized(this, patch, events);
    } else {
      applyPatch(this, patch);
    }

    // Face actors toward their attack targets when they attack
    for (const { actorId, targetId } of events("combat.attack")) {
      const actor = this.actors.get(actorId);
      const target = this.actors.get(targetId);
      if (actor && target) {
        actor.movement.dir = nearestCardinalDirection(
          actor.movement.coords.angle(target.movement.coords),
        );
      }
    }

    this.actors.flush();
  };
}

export interface OptimisticGameStateSettings {
  useInterpolator: boolean;
  usePatchOptimizer: boolean;
}

const teleportThreshold = TimeSpan.fromSeconds(1.5);
const tileMargin = Math.sqrt(2); // diagonal distance between two tiles

// We need to ignore some updates to let the interpolator complete its work.
// If we receive updates that we trust the interpolator to already be working on,
// we simply ignore those property changes.
function applyPatchOptimized(
  gameState: GameState,
  patch: Patch,
  events: EventAccessFn<GameStateEvents>,
): void {
  for (const op of patch) {
    const [type, [entityName, entityId, componentName], update] = op;

    if (
      entityName === ("actors" satisfies keyof GameState) &&
      componentName === ("movement" satisfies keyof Actor) &&
      type === PatchType.Update
    ) {
      const actor = gameState[entityName].get(entityId as ActorId);
      for (const key of typedKeys(update)) {
        if (
          actor &&
          !shouldApplyMovementUpdate(
            actor.identity.id,
            actor.movement,
            update,
            key,
            events,
          )
        ) {
          delete update[key];
        }
      }
    }

    applyOperation(gameState, op);
  }
}

function shouldApplyMovementUpdate<Key extends keyof MovementTrait>(
  actorId: ActorId,
  target: MovementTrait,
  update: Partial<MovementTrait>,
  key: Key,
  events: EventAccessFn<GameStateEvents>,
) {
  switch (key) {
    case "coords": {
      const threshold = target.speed * teleportThreshold.totalSeconds;
      if (
        update.coords &&
        !update.coords.isWithinDistance(target.coords, threshold)
      ) {
        return true; // Snap to new coords if the distance is too large
      }

      return false;
    }

    case "path": {
      if (
        events("movement.stop").some(
          (stoppedActorId) => stoppedActorId === actorId,
        )
      ) {
        return true;
      }
      if (update.path?.length) {
        return true; // Any new path should be trusted
      }
      // If server says to stop moving, we need to check if to let lerp finish
      const lastRemainingLocalStep = target.path?.[0];
      if (
        lastRemainingLocalStep &&
        lastRemainingLocalStep.isWithinDistance(target.coords, tileMargin)
      ) {
        // The last remaining step is within the tile margin,
        // which means the stop command was likely due to the movement completing,
        // so we want to let the lerp finish its remaining step.
        return false;
      }
      return !isPathEqual(update.path, target.path);
    }
    case "dir": {
      // Client handles actor facing directions completely manually
      return false;
    }
  }

  return update[key] !== target[key];
}
