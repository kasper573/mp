// oxlint-disable max-depth
import type { GameStateEvents } from "@mp/game-service";
import type { Actor, MovementTrait } from "@mp/game-shared";
import { moveAlongPath, type ActorId, type GameState } from "@mp/game-shared";
import { isPathEqual, nearestCardinalDirection } from "@mp/math";
import type { Result } from "@mp/std";
import { err, ok, typedKeys } from "@mp/std";
import type {
  AnyPatch,
  AnySyncState,
  EventAccessFn,
  Operation,
  Patch,
} from "@mp/sync";
import { PatchOperationType, SyncMap, updateState } from "@mp/sync";
import { TimeSpan } from "@mp/time";

export class OptimisticGameState implements GameState {
  globals: GameState["globals"] = new SyncMap();
  actors: GameState["actors"] = new SyncMap();
  items: GameState["items"] = new SyncMap();

  constructor(private settings: () => OptimisticGameStateSettings) {}

  frameCallback = (timeSinceLastFrame: TimeSpan) => {
    if (!this.settings().useInterpolator) {
      return;
    }

    for (const actor of this.actors.values()) {
      if (actor.movement.path && actor.combat.health > 0) {
        moveAlongPath(actor.movement, timeSinceLastFrame);

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
        applyPatchOptimized(this, patch as TypedPatch, events);
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

// Not a full representation of a typesafe GameState Patch,
// but we're only interested in the actor slice, so this does fine here.
type TypedPatch = Patch<keyof GameState, ActorId, Actor>;

// We need to ignore some updates to let the interpolator complete its work.
// If we receive updates that we trust the interpolator to already be working on,
// we simply ignore those property changes.
function applyPatchOptimized(
  gameState: GameState,
  patch: Patch<keyof GameState, ActorId, Actor>,
  events: EventAccessFn<GameStateEvents>,
): void {
  for (const op of patch) {
    if (
      op.type === PatchOperationType.EntityUpdate &&
      op.entityName === "actors"
    ) {
      for (const [entityId, actorUpdate] of op.changes) {
        const localActor = gameState[op.entityName].get(entityId as ActorId);
        if (!localActor) {
          continue;
        }
        for (const key of typedKeys(actorUpdate.movement ?? [])) {
          if (
            !shouldApplyMovementUpdate(localActor, actorUpdate, key, events)
          ) {
            delete actorUpdate.movement[key];
          }
        }
      }
    }

    gameState[op.entityName as keyof GameState].applyOperation(
      // oxlint-disable-next-line no-explicit-any
      op as Operation<any, any, any>,
    );
  }
}

function shouldApplyMovementUpdate(
  local: Actor,
  update: Partial<Actor>,
  key: keyof MovementTrait,
  events: EventAccessFn<GameStateEvents>,
) {
  switch (key) {
    case "coords": {
      const coords = update.movement?.coords as MovementTrait["coords"];
      const threshold = local.movement.speed * teleportThreshold.totalSeconds;
      if (
        coords &&
        !coords.isWithinDistance(local.movement.coords, threshold)
      ) {
        return true; // Snap to new coords if the distance is too large
      }

      return false;
    }

    case "path": {
      if (
        events("movement.stop").some(
          (stoppedActorId) => stoppedActorId === local.identity.id,
        )
      ) {
        return true;
      }
      const path = update.movement?.path as MovementTrait["path"];
      if (path?.length) {
        return true; // Any new path should be trusted
      }
      // If server says to stop moving, we need to check if to let lerp finish
      const lastRemainingLocalStep = local.movement.path?.[0];
      if (
        lastRemainingLocalStep &&
        lastRemainingLocalStep.isWithinDistance(
          local.movement.coords,
          tileMargin,
        )
      ) {
        // The last remaining step is within the tile margin,
        // which means the stop command was likely due to the movement completing,
        // so we want to let the lerp finish its remaining step.
        return false;
      }
      return !isPathEqual(path, local.movement.path);
    }
    case "dir": {
      // Client handles actor facing directions completely manually
      return false;
    }
  }

  return true;
}
