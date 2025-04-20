import type { TimeSpan } from "@mp/time";
import { batch } from "solid-js";
import { createMutable } from "solid-js/store";
import { moveAlongPath } from "../../shared/area/move-along-path";
import type { Actor, ActorId } from "../../server";

/**
 * Creates a record of actors that animate their coords based on their path.
 * This is intended to mirror the server-side movement behavior, but for animation.
 */
export function createAnimatedActors() {
  const actors = createMutable<Record<ActorId, Actor>>({});

  function update(remoteActors: Record<ActorId, Actor>) {
    for (const actor of Object.values(remoteActors)) {
      if (actor.id in actors) {
        applyActorUpdate(actors[actor.id], actor);
      } else {
        Object.assign(actors, { [actor.id]: actor });
      }
    }
    for (const actorId in actors) {
      if (!(actorId in remoteActors)) {
        delete actors[actorId as ActorId];
      }
    }
  }

  function frameCallback(deltaTime: TimeSpan) {
    batch(() => {
      for (const actor of Object.values(actors)) {
        if (actor.path) {
          const [newCoords, newPath] = moveAlongPath(
            actor.coords,
            actor.path,
            actor.speed,
            deltaTime,
          );

          actor.coords = newCoords;
          actor.path = newPath;
        }
      }
    });
  }

  return { actors, update, frameCallback };
}

function applyActorUpdate(localActor: Actor, remoteActor: Actor): void {
  const { coords: newCoords, path: newPath, ...rest } = remoteActor;
  Object.assign(localActor, rest);

  // Sometimes when the server sends a "client has stopped moving" state,
  // there is a race condition that can happen where the client side interpolator
  // is not finished interpolating the final segment of the path.
  // if we then trust the server stop message and stop interpolating,
  // the entity will not end up on a full tile and instead stop somewhere in between.
  const problemCanOccurWhen = localActor.path?.length === 1 && !newPath?.length;
  if (problemCanOccurWhen) {
    // Just trust that it's okay to ignore the new path and let the local path finish interpolating and then unset itself locally.
    // This may be problematic in the future, because clients could theoretically ignore actual stop signals,
    // ie. certain game mechanics like "stun" or "root" effects that should indeed stun immediately,
    // but this should be fine for now.
  } else {
    localActor.path = newPath;
  }

  // If the distance between real and animated coords is too large, snap to real coords
  if (newCoords.distance(localActor.coords) >= 2) {
    localActor.coords = newCoords;
    localActor.path = newPath;
  }
}
