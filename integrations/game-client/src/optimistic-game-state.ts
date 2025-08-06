// oxlint-disable max-depth
import type { FrameCallbackOptions } from "@mp/engine";
import type { GameStateEvents } from "@mp/game-service";
import type { MovementTrait } from "@mp/game-shared";
import { moveAlongPath, type ActorId, type GameState } from "@mp/game-shared";
import { isPathEqual, nearestCardinalDirection } from "@mp/math";
import type { Result } from "@mp/std";
import { err, ok } from "@mp/std";
import type {
  AnyPatch,
  AnySyncState,
  EventAccessFn,
  Operation,
} from "@mp/sync";
import { PatchOperationType, SyncMap, updateState } from "@mp/sync";
import { TimeSpan } from "@mp/time";

export class OptimisticGameState implements GameState {
  area: GameState["area"] = new SyncMap();
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
  };

  applyPatch = (
    patch: AnyPatch,
    events: EventAccessFn<GameStateEvents>,
  ): Result<void, Error> => {
    try {
      if (this.settings().usePatchOptimizer) {
        applyPatchOptimized(this, patch, events);
      } else {
        updateState(this as unknown as AnySyncState, patch);
      }
    } catch (error) {
      return err(new Error(`Failed to apply patch`, { cause: error }));
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

    return ok(void 0);
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
  patch: AnyPatch,
  events: EventAccessFn<GameStateEvents>,
): void {
  for (const op of patch) {
    if (
      op.type === PatchOperationType.EntityUpdate &&
      op.entityName === ("actors" satisfies keyof GameState)
    ) {
      for (const [entityId, flatValues] of op.changes) {
        const actor = gameState[op.entityName].get(entityId as ActorId);
        if (!actor) {
          continue;
        }
        for (const jsonPointer in flatValues) {
          if (
            !shouldApplyMovementUpdate(
              actor.identity.id,
              actor.movement,
              flatValues,
              jsonPointer,
              events,
            )
          ) {
            delete flatValues[jsonPointer as keyof typeof flatValues];
          }
        }
      }
    }

    // oxlint-disable-next-line no-explicit-any
    gameState.actors.applyOperation(op as Operation<any, any, any>);
  }
}

function shouldApplyMovementUpdate<JsonPointer extends string>(
  actorId: ActorId,
  target: MovementTrait,
  flatEntityUpdate: Record<JsonPointer, unknown>,
  jsonPointer: JsonPointer,
  events: EventAccessFn<GameStateEvents>,
) {
  switch (jsonPointer) {
    case "movement/coords": {
      const coords = flatEntityUpdate[jsonPointer] as MovementTrait["coords"];
      const threshold = target.speed * teleportThreshold.totalSeconds;
      if (coords && !coords.isWithinDistance(target.coords, threshold)) {
        return true; // Snap to new coords if the distance is too large
      }

      return false;
    }

    case "movement/path": {
      if (
        events("movement.stop").some(
          (stoppedActorId) => stoppedActorId === actorId,
        )
      ) {
        return true;
      }
      const path = flatEntityUpdate[jsonPointer] as MovementTrait["path"];
      if (path?.length) {
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
      return !isPathEqual(path, target.path);
    }
    case "dir": {
      // Client handles actor facing directions completely manually
      return false;
    }
  }

  return true;
}
