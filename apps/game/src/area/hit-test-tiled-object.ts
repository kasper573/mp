import type { VectorTiledObjectUnion } from "@mp/tiled-loader";
import {
  ellipseHitTest,
  polygonHitTest,
  polylineHitTest,
  type Vector,
  Rect,
} from "@mp/math";
import type { Pixel } from "@mp/std";

export function hitTestTiledObject(
  obj: VectorTiledObjectUnion,
  pos: Vector<Pixel>,
): boolean {
  switch (obj.objectType) {
    case "point":
      return obj.position.equals(pos);
    case "ellipse":
      return ellipseHitTest(new Rect(obj.position, obj.size), pos);
    case "rectangle":
      return new Rect(obj.position, obj.size).contains(pos);
    case "polygon":
      return polygonHitTest(obj, pos);
    case "polyline":
      return polylineHitTest(obj, pos);
    case "text":
      return false;
    case "tile":
      return new Rect(obj.position, obj.size).contains(pos);
  }
}
