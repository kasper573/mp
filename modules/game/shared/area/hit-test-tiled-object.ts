import type { TiledObject } from "@mp/tiled-loader";
import {
  ellipseHitTest,
  polygonHitTest,
  polylineHitTest,
  type Vector,
  vecEquals,
  rectHitTest,
} from "@mp/math";
import type { Pixel } from "@mp/std";

export function hitTestTiledObject(
  obj: TiledObject,
  pos: Vector<Pixel>,
): boolean {
  switch (obj.objectType) {
    case "point":
      return vecEquals(obj, pos);
    case "ellipse":
      return ellipseHitTest(obj, pos);
    case "rectangle":
      return rectHitTest(obj, pos);
    case "polygon":
      return polygonHitTest(obj, pos);
    case "polyline":
      return polylineHitTest(obj, pos);
    case "text":
      return false;
  }
}
