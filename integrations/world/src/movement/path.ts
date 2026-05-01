import { Vector } from "@mp/math";
import type { Tile } from "@mp/std";

interface MovementValue {
  readonly coords: Vector<Tile>;
  readonly speed: Tile;
  readonly path: ReadonlyArray<Vector<Tile>>;
}

export function moveAlongPath<T extends MovementValue>(
  target: T,
  deltaSeconds: number,
): T {
  let distanceToMove = target.speed * deltaSeconds;
  if (!distanceToMove || target.path.length === 0) {
    return target;
  }

  let coords = target.coords;

  let pathIndex = 0;
  const lastIndex = target.path.length - 1;
  while (pathIndex <= lastIndex && distanceToMove > 0) {
    const destination = target.path[pathIndex];
    const dx = destination.x - coords.x;
    const dy = destination.y - coords.y;
    const distanceToDestination = Math.hypot(dx, dy);

    if (distanceToMove > distanceToDestination) {
      distanceToMove -= distanceToDestination;
      coords = destination;
      pathIndex++;
    } else {
      const percentage = distanceToMove / distanceToDestination;
      coords = new Vector(
        (coords.x + dx * percentage) as Tile,
        (coords.y + dy * percentage) as Tile,
      );
      break;
    }
  }

  const remaining = pathIndex > lastIndex ? [] : target.path.slice(pathIndex);

  return {
    ...target,
    coords,
    path: remaining,
  };
}
