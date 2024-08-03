import type { VectorLike } from "@mp/excalibur";
import type { TimeSpan } from "timespan-ts";

export function moveAlongPath(
  coords: VectorLike,
  path: ArrayLike<VectorLike>,
  speed: number,
  delta: TimeSpan,
): void {
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
}

interface ArrayLike<T> {
  shift(): T | undefined;
  length: number;
  [index: number]: T;
}
