import type { Tile } from "@mp/std";

interface MovementValue {
  readonly coords: { readonly x: Tile; readonly y: Tile };
  readonly speed: Tile;
  readonly path: ReadonlyArray<{ readonly x: Tile; readonly y: Tile }>;
}

export function moveAlongPath<T extends MovementValue>(
  target: T,
  deltaSeconds: number,
): T {
  let distanceToMove = target.speed * deltaSeconds;
  if (!distanceToMove || target.path.length === 0) {
    return target;
  }

  const coords = { x: target.coords.x, y: target.coords.y };

  let pathIndex = 0;
  const lastIndex = target.path.length - 1;
  while (pathIndex <= lastIndex && distanceToMove > 0) {
    const destination = target.path[pathIndex];
    const dx = destination.x - coords.x;
    const dy = destination.y - coords.y;
    const distanceToDestination = Math.hypot(dx, dy);

    if (distanceToMove > distanceToDestination) {
      distanceToMove -= distanceToDestination;
      coords.x = destination.x;
      coords.y = destination.y;
      pathIndex++;
    } else {
      const percentage = distanceToMove / distanceToDestination;
      coords.x = (coords.x + dx * percentage) as Tile;
      coords.y = (coords.y + dy * percentage) as Tile;
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
