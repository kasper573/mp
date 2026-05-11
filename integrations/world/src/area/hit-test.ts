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

export function tiledObjectBoundingBox(obj: TiledObject): Rect<Pixel> {
  switch (obj.objectType) {
    case "point":
      return Rect.from({
        x: obj.x,
        y: obj.y,
        width: 1 as Pixel,
        height: 1 as Pixel,
      });
    case "ellipse":
    case "rectangle":
    case "text":
      return Rect.from({
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
      });
    case "polygon":
    case "polyline": {
      const xs =
        obj.objectType === "polygon"
          ? obj.polygon.map((p) => p.x)
          : obj.polyline.map((p) => p.x);
      const ys =
        obj.objectType === "polygon"
          ? obj.polygon.map((p) => p.y)
          : obj.polyline.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return Rect.from({
        x: (obj.x + minX) as Pixel,
        y: (obj.y + minY) as Pixel,
        width: (maxX - minX) as Pixel,
        height: (maxY - minY) as Pixel,
      });
    }
  }
}
