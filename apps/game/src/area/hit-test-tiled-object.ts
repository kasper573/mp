import type { TiledObjectWithVectors } from "@mp/tiled-loader";
import type { RectLike, VectorLike } from "@mp/math";
import {
  ellipseHitTest,
  polygonHitTest,
  polylineHitTest,
  Vector,
  Rect,
} from "@mp/math";
import type { Pixel } from "@mp/std";

export function hitTestTiledObject(
  obj: TiledObjectWithVectors,
  pos: VectorLike<Pixel>,
): boolean {
  // We reuse prototype methods to avoid allocations since this is a hot code path.
  switch (obj.objectType) {
    case "point":
      return obj.position.equals(pos);
    case "ellipse":
      // Create ellipse from position and size
      const ellipse = { x: obj.position.x, y: obj.position.y, width: obj.size.x, height: obj.size.y };
      return ellipseHitTest(ellipse, pos);
    case "rectangle":
      // Create a rectangle from position and size
      const rect = { x: obj.position.x, y: obj.position.y, width: obj.size.x, height: obj.size.y };
      return Rect.prototype.contains.call(rect, pos);
    case "polygon":
      return polygonHitTest(obj, pos);
    case "polyline":
      return polylineHitTest(obj, pos);
    case "text":
      return false;
    default:
      return false;
  }
}
