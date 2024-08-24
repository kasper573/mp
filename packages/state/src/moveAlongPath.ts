import type { Vector } from "@mp/math";
import type { TimeSpan } from "timespan-ts";

export function moveAlongPath(
  coords: Vector,
  path: ShiftableArray<Vector>,
  speed: number,
  delta: TimeSpan,
): { destinationReached: boolean } {
  const pathLengthBefore = path.length;

  let distance = speed * delta.totalSeconds;
  while (path.length > 0 && distance > 0) {
    const destination = path[0];
    const distanceToDestination = Math.hypot(
      destination.x - coords.x,
      destination.y - coords.y,
    );

    if (distance > distanceToDestination) {
      distance -= distanceToDestination;
      const { x, y } = path.shift()!;
      coords.x = x;
      coords.y = y;
    } else {
      const percentage = distance / distanceToDestination;
      coords.x += (destination.x - coords.x) * percentage;
      coords.y += (destination.y - coords.y) * percentage;
      break;
    }

    // TODO add new coordinate to travelled path when implementing collision detection
  }

  return {
    destinationReached: path.length === 0 && pathLengthBefore > 0,
  };
}

interface ShiftableArray<T> extends ArrayLike<T> {
  shift(): T | undefined;
}
