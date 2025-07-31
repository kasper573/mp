import { Rect, type Vector, clamp } from "@mp/math";
import type { Tile } from "@mp/std";

/**
 * Diameter in tiles around the player that determines what a player can see and the zoom level of the camera.
 * We have one number for rendering and one for networking to allow for some margin
 * in the renderer so that objects don't pop in and out of view.
 */
export const clientViewDistance = {
  renderedTileCount: 24 as Tile,
  networkFogOfWarTileCount: 32 as Tile,
};

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
