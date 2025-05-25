import { TimeSpan } from "@mp/time";
import type { FrameCallbackOptions } from "@mp/engine";
import { createMutable } from "solid-js/store";
import type { EventAccessFn, Patch } from "@mp/sync";
import { applyPatch, optimizePatch, PatchOptimizerBuilder } from "@mp/sync";
import type { Accessor } from "solid-js";
import { batch, createContext, untrack } from "solid-js";
import { nearestCardinalDirection, type Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import type { Actor } from "../server";
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
    getEvents: EventAccessFn<GameStateEvents>,
  ) => {
    batch(() => {
      const filteredPatch = settings().usePatchOptimizer
        ? optimizePatch(gameState, patch, patchOptimizer, getEvents)
        : patch;
      applyPatch(gameState, filteredPatch);
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
// we use a patch optimizer to simply ignore those patch operations.
const patchOptimizer = new PatchOptimizerBuilder<GameState, GameStateEvents>()
  .entity("actors", (b) =>
    b
      .property("coords", (b) =>
        b.filter((newValue, oldValue, actor, update) => {
          if (update.areaId && update.areaId !== actor.areaId) {
            return true; // Always trust new coord when area changes
          }
          const threshold = actor.speed * teleportThreshold.totalSeconds;
          if (newValue.distance(oldValue) >= threshold) {
            return true; // Snap to new coords if the distance is too large
          }
          return false;
        }),
      )
      .property("path", (b) =>
        b.filter((newValue, oldValue, actor, update, events) => {
          if (events("movement.stop").some((id) => id === actor.id)) {
            return true;
          }
          if (update.areaId && update.areaId !== actor.areaId) {
            return true; // Always trust new path when area changes
          }
          if (newValue?.length) {
            return true; // Any new path should be trusted
          }
          // If server says to stop moving, we need to check if to let lerp finish
          const lastRemainingLocalStep = oldValue?.[0];
          if (
            lastRemainingLocalStep &&
            lastRemainingLocalStep.distance(actor.coords) <= tileMargin
          ) {
            // The last remaining step is within the tile margin,
            // which means the stop command was likely due to the movement completing,
            // so we want to let the lerp finish its remaining step.
            return false;
          } else {
            // Stopped moving for some other reason than finishing moving naturally,
            // ie. teleport or some other effect. We do not want to finish lerping.
            // Just stop immediately and snap to the new coords.
            return true;
          }
        }),
      ),
  )
  .build();
