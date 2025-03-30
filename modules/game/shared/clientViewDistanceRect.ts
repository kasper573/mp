import { type Vector, rect_from_diameter } from "@mp/math";
import type { Tile } from "@mp/std";

export function clientViewDistanceRect(
  coords: Vector<Tile>,
  viewDistance: Tile,
) {
  return rect_from_diameter(coords, viewDistance);
}
