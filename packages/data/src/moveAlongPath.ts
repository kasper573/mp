import { vec_distance, type Vector } from "@mp/math";
import type { TimeSpan } from "@mp/time";

export function moveAlongPath<T extends number>(
  coords: Vector<T>,
  path: ShiftableArray<Vector<T>>,
  speed: NoInfer<T>,
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
      coords.x = (coords.x + (destination.x - coords.x) * percentage) as T;
      coords.y = (coords.y + (destination.y - coords.y) * percentage) as T;
      break;
    }
  }
}

interface ShiftableArray<T> extends ArrayLike<T> {
  shift(): T | undefined;
}
