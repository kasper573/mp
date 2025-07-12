import type { Path } from "@mp/math";
import { Vector } from "@mp/math";
import { assert } from "@mp/std";
import type { TimeSpan } from "@mp/time";

export function moveAlongPath<T extends number>(
  coords: Vector<T>,
  path: Path<T>,
  speed: NoInfer<T>,
  delta: TimeSpan,
): [Vector<T>, Path<T> | undefined] {
  let distanceToMove = speed * delta.totalSeconds;
  let newCoords = coords;
  const newPath = [...path];

  while (newPath.length > 0 && distanceToMove > 0) {
    const destination = newPath[0];
    const distanceToDestination = destination.distance(newCoords);

    if (distanceToMove > distanceToDestination) {
      distanceToMove -= distanceToDestination;
      newCoords = assert(newPath.shift());
    } else {
      const percentage = distanceToMove / distanceToDestination;
      newCoords = new Vector(
        (newCoords.x + (destination.x - newCoords.x) * percentage) as T,
        (newCoords.y + (destination.y - newCoords.y) * percentage) as T,
      );

      break;
    }
  }
  if (newPath.length === 0) {
    return [newCoords, undefined];
  } else if (newPath.length === path.length) {
    return [newCoords, path];
  }
    return [newCoords, newPath];
  
}
