import { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import type { TimeSpan } from "@mp/time";
import type { MovementTrait } from "./movement";

/**
 * Mutates the given target so that it walks along its current path.
 * The distance moved will be derived from its current speed and the given time delta.
 */
export function moveAlongPath(target: MovementTrait, delta: TimeSpan): void {
  let distanceToMove = target.speed * delta.totalSeconds;
  if (!distanceToMove || !target.path) {
    return;
  }

  if (!target.path.length) {
    target.path = undefined;
    return;
  }

  const newCoords = { x: target.coords.x, y: target.coords.y };

  let pathIndex = 0;
  let lastIndex = target.path.length - 1;
  while (pathIndex <= lastIndex && distanceToMove > 0) {
    const destination = target.path[pathIndex];
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

  target.coords = Vector.from(newCoords);
  if (pathIndex > lastIndex) {
    target.path = undefined;
  } else if (pathIndex > 0) {
    target.path = target.path.slice(pathIndex);
  }
}
