import { Vector } from "@mp/math";
import type { TimeSpan } from "@mp/time";
import type { Actor } from "../actor/actor";
import type { Tile } from "@mp/std";

/**
 * Mutates the given actor so that it walks along its current path.
 * The distance moved will be derived from its current speed and the given time delta.
 */
export function moveAlongPath(actor: Actor, delta: TimeSpan): void {
  let distanceToMove = actor.speed * delta.totalSeconds;
  if (!distanceToMove || !actor.path) {
    return;
  }

  if (!actor.path.length) {
    actor.path = undefined;
    return;
  }

  const newCoords = { x: actor.coords.x, y: actor.coords.y };

  let pathIndex = 0;
  let lastIndex = actor.path.length - 1;
  while (pathIndex <= lastIndex && distanceToMove > 0) {
    const destination = actor.path[pathIndex];
    const distanceToDestination = destination.distance(newCoords);

    if (distanceToMove > distanceToDestination) {
      distanceToMove -= distanceToDestination;
      newCoords.x = destination.x;
      newCoords.y = destination.y;
      pathIndex++;
    } else {
      const percentage = distanceToMove / distanceToDestination;
      newCoords.x = (newCoords.x +
        (destination.x - newCoords.x) * percentage) as Tile;
      newCoords.y = (newCoords.y +
        (destination.y - newCoords.y) * percentage) as Tile;

      break;
    }
  }

  actor.coords = Vector.from(newCoords);
  if (pathIndex > lastIndex) {
    actor.path = undefined;
  } else if (pathIndex > 0) {
    actor.path = actor.path.slice(pathIndex);
  }
}
