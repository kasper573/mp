import type { VectorLike } from "@mp/math";
import type { TimeSpan } from "@mp/time";

export function moveAlongPath(
  coords: VectorLike,
  path: ShiftableArray<VectorLike>,
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
  }

  return {
    destinationReached: path.length === 0 && pathLengthBefore > 0,
  };
}

interface ShiftableArray<T> extends ArrayLike<T> {
  shift(): T | undefined;
}
