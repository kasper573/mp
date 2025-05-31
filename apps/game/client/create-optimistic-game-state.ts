import { TimeSpan } from "@mp/time";
import type { FrameCallbackOptions } from "@mp/engine";
import { createMutable } from "solid-js/store";
import type { EventAccessFn, Patch } from "@mp/sync";
import { applyOperation, applyPatch, PatchType } from "@mp/sync";
import type { Accessor } from "solid-js";
import { batch, createContext, untrack } from "solid-js";
import { isPathEqual, nearestCardinalDirection, type Vector } from "@mp/math";
import { typedKeys, type Tile } from "@mp/std";
import type { Actor, ActorId } from "../server";
import { type GameState } from "../server";
import { moveAlongPath } from "../shared/area/move-along-path";
import type { GameStateEvents } from "../server/game-state-events";

export function createOptimisticGameState(
  settings: Accessor<OptimisticGameStateSettings>,
) {
  const gameState = createMutable<GameState>({ actors: {} });

  /**
   * Returns the current optimistic game state.
   */
  function optimisticGameState(): GameState {
    return gameState;
  }

  optimisticGameState.frameCallback = (opt: FrameCallbackOptions) => {
    const { enabled, actors } = untrack(() => ({
      enabled: settings().useInterpolator,
      actors: gameState.actors,
    }));

    if (enabled) {
      for (const actor of Object.values(actors)) {
        if (actor.path && actor.health > 0) {
          const [newCoords, newPath] = moveAlongPath(
            actor.coords,
            actor.path,
            actor.speed,
            opt.timeSinceLastFrame,
          );

          actor.coords = newCoords;
          actor.path = newPath;

          const facingTarget = getFacingTarget(actor);
          if (facingTarget) {
            actor.dir = nearestCardinalDirection(
              actor.coords.angle(facingTarget),
            );
          }
        }
      }

      function getFacingTarget(actor: Actor): Vector<Tile> | undefined {
        if (actor.path?.length) {
          return actor.path[0];
        }
        if (actor.attackTargetId) {
          const target = actors[actor.attackTargetId] as Actor | undefined;
          return target?.coords;
        }
      }
    }
  };

  optimisticGameState.applyPatch = (
    patch: Patch,
    events: EventAccessFn<GameStateEvents>,
  ) => {
    batch(() => {
      if (settings().usePatchOptimizer) {
        applyPatchOptimized(gameState, patch, events);
      } else {
        applyPatch(gameState, patch);
      }
    });
  };

  return optimisticGameState;
}

export interface OptimisticGameStateSettings {
  useInterpolator: boolean;
  usePatchOptimizer: boolean;
}

export const OptimisticGameStateContext = createContext(
  new Proxy({} as OptimisticGameStateSettings, {
    get() {
      throw new Error("OptimisticGameStateContext has not been initialized");
    },
  }),
);

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
    const [type, [entityName, entityId], update] = op;

    if (
      entityName === ("actors" satisfies keyof GameState) &&
      type === PatchType.Update
    ) {
      const actor = gameState[entityName][entityId as ActorId];
      for (const key of typedKeys(update)) {
        if (!shouldApplyActorUpdate(actor, update, key, events)) {
          delete update[key];
        }
      }
    }

    applyOperation(gameState, op);
  }
}

function shouldApplyActorUpdate<Key extends keyof Actor>(
  actor: Actor,
  update: Partial<Actor>,
  key: Key,
  events: EventAccessFn<GameStateEvents>,
) {
  switch (key) {
    case "coords": {
      if (update.areaId && update.areaId !== actor.areaId) {
        return true; // Always trust new coord when area changes
      }
      const threshold = actor.speed * teleportThreshold.totalSeconds;
      if (update.coords && update.coords.distance(actor.coords) >= threshold) {
        return true; // Snap to new coords if the distance is too large
      }

      return false;
    }

    case "path": {
      if (events("movement.stop").some((id) => id === actor.id)) {
        return true;
      }
      if (update.areaId && update.areaId !== actor.areaId) {
        return true; // Always trust new path when area changes
      }
      if (update.path?.length) {
        return true; // Any new path should be trusted
      }
      // If server says to stop moving, we need to check if to let lerp finish
      const lastRemainingLocalStep = actor.path?.[0];
      if (
        lastRemainingLocalStep &&
        lastRemainingLocalStep.distance(actor.coords) <= tileMargin
      ) {
        // The last remaining step is within the tile margin,
        // which means the stop command was likely due to the movement completing,
        // so we want to let the lerp finish its remaining step.
        return false;
      }
      return !isPathEqual(update.path, actor.path);
    }
  }

  return update[key] !== actor[key];
}
