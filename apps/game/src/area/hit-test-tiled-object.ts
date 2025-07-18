import type { TiledObject } from "@mp/tiled-loader";
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
  obj: TiledObject,
  pos: VectorLike<Pixel>,
): boolean {
  // We reuse prototype methods to avoid allocations since this is a hot code path.
  // This is possible because the input data structures happen to match the expected types.
  // (We add satisfies assertions to ensure this doesn't break in the future.)
  switch (obj.objectType) {
    case "point":
      return Vector.prototype.equals.call(
        obj satisfies VectorLike<number>,
        pos,
      );
    case "ellipse":
      return ellipseHitTest(obj, pos);
    case "rectangle":
      return Rect.prototype.contains.call(obj satisfies RectLike<number>, pos);
    case "polygon":
      return polygonHitTest(obj, pos);
    case "polyline":
      return polylineHitTest(obj, pos);
    case "text":
      return false;
  }
}
