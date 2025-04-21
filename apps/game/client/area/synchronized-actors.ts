import { batch } from "solid-js";
import { createMutable } from "solid-js/store";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { TimeSpan } from "@mp/time";
import type { FrameCallbackOptions } from "@mp/engine";
import { moveAlongPath } from "../../shared/area/move-along-path";
import type { Actor, ActorId } from "../../server";

/**
 * On a LocalActor the "coords" property is the interpolated position.
 * This is what is considered the real position of the actor on the client.
 */
type LocalActor = Actor & {
  /**
   * For local actors, "coords" is the interpolated position,
   * which may be out of sync with the authoritative coords on the server.
   * We store the latest remote coords received from the server here,
   * and use it to determine where to move towards, or if we're too out of sync.
   */
  remoteCoords: Vector<Tile>;
  /**
   * The last remote time for when an update was received and applied to the actor
   */
  lastReceivedRemoteUpdateTime: Date;
};

const teleportThreshold = TimeSpan.fromSeconds(1.5);

/**
 * Creates a record of actors that animate their coords based on their path.
 * This is intended to mirror the server-side movement behavior, but for animation.
 */
export function createSynchronizedActors() {
  const localActors = createMutable<Record<ActorId, LocalActor>>({});

  function receiveRemoteUpdate(
    remoteActors: Record<ActorId, Actor>,
    remoteTime: Date,
  ) {
    batch(() => {
      for (const remoteActor of Object.values(remoteActors)) {
        if (remoteActor.id in localActors) {
          applyRemoteActorUpdate(
            localActors[remoteActor.id],
            remoteActor,
            remoteTime,
          );
        } else {
          Object.assign(localActors, {
            [remoteActor.id]: remoteToLocalActor(remoteActor, remoteTime),
          });
        }
      }
      for (const actorId in localActors) {
        if (!(actorId in remoteActors)) {
          delete localActors[actorId as ActorId];
        }
      }
    });
  }

  function advanceLocalUpdate({ timeSinceLastFrame }: FrameCallbackOptions) {
    batch(() => {
      for (const actor of Object.values(localActors)) {
        if (actor.path) {
          const [newCoords, newPath] = moveAlongPath(
            actor.coords,
            actor.path,
            actor.speed,
            timeSinceLastFrame,
          );

          actor.coords = newCoords;
          actor.path = newPath;
        }
      }
    });
  }

  return { record: localActors, receiveRemoteUpdate, advanceLocalUpdate };
}

function remoteToLocalActor(actor: Actor, remoteTime: Date): LocalActor {
  return {
    ...actor,
    coords: actor.coords,
    remoteCoords: actor.coords,
    lastReceivedRemoteUpdateTime: remoteTime,
  };
}

function applyRemoteActorUpdate(
  localActor: LocalActor,
  remoteActor: Actor,
  remoteTime: Date,
) {
  // Drop out of order or duplicate updates
  if (remoteTime <= localActor.lastReceivedRemoteUpdateTime) {
    return;
  }

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
  const diff = localActor.coords.distance(remoteActor.coords);
  const threshold = localActor.speed * teleportThreshold.totalSeconds;
  if (diff >= threshold) {
    localActor.coords = newCoords;
    localActor.path = newPath;
  }

  localActor.lastReceivedRemoteUpdateTime = remoteTime;
}
