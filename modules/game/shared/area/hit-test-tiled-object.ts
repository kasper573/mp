import type { TiledObject } from "@mp/tiled-loader";
import {
  ellipseHitTest,
  polygon_hit_test,
  polyline_hit_test,
  type Vector,
  vecEquals,
  rect_hit_test,
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
      return rect_hit_test(obj, pos);
    case "polygon":
      return polygon_hit_test(obj, pos);
    case "polyline":
      return polyline_hit_test(obj, pos);
    case "text":
      return false;
  }
}
