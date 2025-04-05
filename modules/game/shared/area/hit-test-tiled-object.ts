import type { TiledObject } from "@mp/tiled-loader";
import {
  ellipse_hit_test,
  polygon_hit_test,
  polyline_hit_test,
  type Vector,
  vec_equals,
  rect_hit_test,
} from "@mp/math";
import type { Pixel } from "@mp/std";

export function hitTestTiledObject(
  obj: TiledObject,
  pos: Vector<Pixel>,
): boolean {
  switch (obj.objectType) {
    case "point":
      return vec_equals(obj, pos);
    case "ellipse":
      return ellipse_hit_test(obj, pos);
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
