import type { TiledObject } from "@mp/tiled-loader";
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
  pos: Vector<Pixel>,
): boolean {
  switch (obj.objectType) {
    case "point":
      return Vector.from(obj).equals(pos);
    case "ellipse":
      return ellipseHitTest(Rect.from(obj), pos);
    case "rectangle":
      return Rect.from(obj).contains(pos);
    case "polygon":
      return polygonHitTest(obj, pos);
    case "polyline":
      return polylineHitTest(obj, pos);
    case "text":
      return false;
  }
}
