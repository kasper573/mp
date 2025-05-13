import { TimeSpan } from "@mp/time";
import type { FrameCallbackOptions } from "@mp/engine";
import { createMutable } from "solid-js/store";
import type { Patch } from "@mp/sync";
import { applyPatch, filterPatchUpdates } from "@mp/sync";
import { batch } from "solid-js";
import { type GameState } from "../server";
import { moveAlongPath } from "../shared/area/move-along-path";

export function createOptimisticGameState() {
  const gameState = createMutable<GameState>({ actors: {} });

  /**
   * Returns the current optimistic game state.
   */
  function optimisticGameState(): GameState {
    return gameState;
  }

  // eslint-disable-next-line solid/reactivity
  optimisticGameState.frameCallback = (opt: FrameCallbackOptions) => {
    for (const actor of Object.values(gameState.actors)) {
      if (actor.path) {
        const [newCoords, newPath] = moveAlongPath(
          actor.coords,
          actor.path,
          actor.speed,
          opt.timeSinceLastFrame,
        );

        actor.coords = newCoords;
        actor.path = newPath;
      }
    }
  };

  optimisticGameState.applyPatch = (patch: Patch) => {
    batch(() => {
      // We need to ignore some updates to let the interpolator complete its work.
      // If we receive updates that we trust the interpolator to already be working on,
      // we simply ignore those patch operations.
      const filteredPatch = filterPatchUpdates(gameState, patch, {
        actors: {
          coords(newValue, oldValue, actor, update) {
            if (update.areaId && update.areaId !== actor.areaId) {
              return true; // Always trust new coord when area changes
            }
            const threshold = actor.speed * teleportThreshold.totalSeconds;
            if (newValue.distance(oldValue) >= threshold) {
              return true; // Snap to new coords if the distance is too large
            }
            return false;
          },
          path(newValue, oldValue, actor, update) {
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
          },
        },
      });

      applyPatch(gameState, filteredPatch);
    });
  };

  return optimisticGameState;
}

const teleportThreshold = TimeSpan.fromSeconds(1.5);
const tileMargin = Math.sqrt(2); // diagonal distance between two tiles
