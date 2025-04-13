import { Rect, type Vector, clamp } from "@mp/math";
import type { Tile } from "@mp/std";

export function clientViewDistanceRect(
  coords: Vector<Tile>,
  mapSize: Vector<Tile>,
  viewDistance: Tile,
) {
  const halfViewDistance = Math.floor(viewDistance / 2);
  const clampedCoords = {
    x: clamp(coords.x, halfViewDistance, mapSize.x - halfViewDistance),
    y: clamp(coords.y, halfViewDistance, mapSize.y - halfViewDistance),
  } as Vector<Tile>;
  return Rect.fromDiameter(clampedCoords, viewDistance);
}
