import { vec_distance, type Vector } from "@mp/math";
import type { TimeSpan } from "@mp/time";

export function moveAlongPath(
  coords: Vector,
  path: ShiftableArray<Vector>,
  speed: number,
  delta: TimeSpan,
): void {
  let distanceToMove = speed * delta.totalSeconds;
  while (path.length > 0 && distanceToMove > 0) {
    const destination = path[0];
    const distanceToDestination = vec_distance(destination, coords);

    if (distanceToMove > distanceToDestination) {
      distanceToMove -= distanceToDestination;
      const { x, y } = path.shift()!;
      coords.x = x;
      coords.y = y;
    } else {
      const percentage = distanceToMove / distanceToDestination;
      coords.x += (destination.x - coords.x) * percentage;
      coords.y += (destination.y - coords.y) * percentage;
      break;
    }
  }
}

interface ShiftableArray<T> extends ArrayLike<T> {
  shift(): T | undefined;
}
