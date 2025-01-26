import type {
  EllipseObject,
  PointObject,
  PolygonObject,
  PolylineObject,
  RectangleObject,
  TextObject,
  TiledObject,
} from "@mp/tiled-loader";
import type { Vector } from "@mp/math";
import type { Pixel } from "@mp/std";

export function hitTestTiledObject(
  obj: TiledObject,
  pos: Vector<Pixel>,
): boolean {
  switch (obj.objectType) {
    case "point":
      return point(obj, pos);
    case "ellipse":
      return ellipse(obj, pos);
    case "rectangle":
      return rectangle(obj, pos);
    case "polygon":
      return polygon(obj, pos);
    case "polyline":
      return polyline(obj, pos);
    case "text":
      return text(obj, pos);
  }
}

function point(obj: PointObject, pos: Vector<Pixel>): boolean {
  return obj.x === pos.x && obj.y === pos.y;
}

function ellipse(obj: EllipseObject, pos: Vector<Pixel>): boolean {
  const { x, y, width, height } = obj;
  const dx = x - pos.x;
  const dy = y - pos.y;
  const rx = width / 2;
  const ry = height / 2;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}

function rectangle(obj: RectangleObject, pos: Vector<Pixel>): boolean {
  const { x, y, width, height } = obj;
  return pos.x >= x && pos.x <= x + width && pos.y >= y && pos.y <= y + height;
}

function polygon(obj: PolygonObject, pos: Vector<Pixel>): boolean {
  return false;
}

function polyline(obj: PolylineObject, pos: Vector<Pixel>): boolean {
  return false;
}

function text(obj: TextObject, pos: Vector<Pixel>): boolean {
  return false;
}
