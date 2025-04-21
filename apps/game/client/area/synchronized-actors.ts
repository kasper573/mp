import { batch, createEffect, untrack } from "solid-js";
import { createMutable } from "solid-js/store";
import { TimeSpan } from "@mp/time";
import type { FrameCallbackOptions } from "@mp/engine";
import type { Path } from "@mp/math";
import { pathCopy, Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { moveAlongPath } from "../../shared/area/move-along-path";
import type { Actor, ActorId } from "../../server";

const teleportThreshold = TimeSpan.fromSeconds(1.5);

type LocalActorChange = Pick<Actor, "coords" | "path"> & {
  pathChange?: { type: "update"; value: Path<Tile> } | { type: "stop" };
};

/**
 * Creates a record of actors that animate their coords based on their path.
 * This is intended to mirror the server-side movement behavior, but for animation.
 */
export function createSynchronizedActors(
  getRemoteActorIds: () => ActorId[],
  getRemoteActor: (id: ActorId) => Actor,
) {
  const localChanges = createMutable<Record<ActorId, LocalActorChange>>({});
  function getLocalActor(id: ActorId) {
    return new Proxy<Actor>({} as Actor, {
      get(target, prop) {
        const local = localChanges[id];
        if (local && prop in local) {
          return local[prop as keyof LocalActorChange];
        }
        return getRemoteActor(id)?.[prop as keyof Actor];
      },
    });
  }

  function getLocalActorList() {
    return getRemoteActorIds().map(getLocalActor);
  }

  function getOrCreateLocalChange(id: ActorId): LocalActorChange {
    let change = localChanges[id];
    if (!change) {
      const actor = getRemoteActor(id);
      change = deriveLocalChange(actor);
      Object.assign(localChanges, { [id]: change });
    }
    return change;
  }

  function frameCallback({ timeSinceLastFrame }: FrameCallbackOptions) {
    batch(() => {
      for (const actorId of getRemoteActorIds()) {
        const local = getOrCreateLocalChange(actorId);
        const remote = getRemoteActor(actorId);

        if (local.pathChange) {
          switch (local.pathChange.type) {
            case "update":
              // A completely new path should always take precedence over the old path.
              local.path = pathCopy(local.pathChange.value);
              break;
            case "stop": {
              const lastRemainingStep = local.path?.[0];
              if (
                lastRemainingStep &&
                lastRemainingStep.distance(remote.coords) <= tileMargin
              ) {
                // The last remaining step is within the tile margin,
                // which means the stop command was likely due to the movement completing,
                // so we want to let the lerp finish its remaining step.
              } else {
                // Stopped moving for some other reason than finishing moving naturally,
                // ie. teleport or some other effect. We do not want to finish lerping.
                // Just stop immediately and snap to the new coords.
                local.path = undefined;
              }
              break;
            }
          }

          // Consume the path change
          delete local.pathChange;
        }

        if (local.path) {
          const [newCoords, newPath] = moveAlongPath(
            local.coords,
            local.path,
            remote.speed,
            timeSinceLastFrame,
          );

          local.coords = newCoords;
          local.path = newPath;
        } else if (!remote.coords.equals(local.coords)) {
          const [newCoords] = moveAlongPath(
            local.coords,
            [remote.coords],
            remote.speed,
            timeSinceLastFrame,
          );

          local.coords = newCoords;
        }

        // If the distance between real and animated coords is too large, snap to real coords
        const diff = remote.coords.distance(local.coords);
        const threshold = remote.speed * teleportThreshold.totalSeconds;
        if (diff >= threshold) {
          local.coords = Vector.from(remote.coords);
        }
      }
    });
  }

  createEffect(() => {
    for (const actorId of getRemoteActorIds()) {
      const { path } = getRemoteActor(actorId);

      untrack(() => {
        const change = getOrCreateLocalChange(actorId);
        change.pathChange = path?.length
          ? { type: "update", value: pathCopy(path) }
          : { type: "stop" };
      });
    }
  });

  return {
    get: getLocalActor,
    list: getLocalActorList,
    frameCallback,
  };
}

function deriveLocalChange(actor: Actor): LocalActorChange {
  return {
    coords: Vector.from(actor.coords),
    path: pathCopy(actor.path),
  };
}

const tileMargin = Math.sqrt(2); // diagonal distance between two tiles
