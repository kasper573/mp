import type {
  GlobalTileId,
  ObjectId,
  Pixel,
  Coord,
  Degrees,
  TiledClass,
} from "./common";

import type { Property } from "./property";
import type { TiledText } from "./text";
import type { Tileset } from "./tileset";

export interface SharedObjectProperties {
  gid?: GlobalTileId;
  id: ObjectId;
  name: string;
  x: Pixel;
  y: Pixel;
  height: Pixel;
  width: Pixel;
  rotation: Degrees;
  type?: TiledClass;
  visible: boolean;
  properties?: Property[];
}

export interface EllipseObject extends SharedObjectProperties {
  objectType: "ellipse";
}

export interface PointObject extends SharedObjectProperties {
  objectType: "point";
}

export interface PolygonObject extends SharedObjectProperties {
  objectType: "polygon";
  polygon: Coord[];
}

export interface PolylineObject extends SharedObjectProperties {
  objectType: "polyline";
  polyline: Coord[];
}

export interface TextObject extends SharedObjectProperties {
  objectType: "text";
  text: TiledText;
}

export interface RectangleObject extends SharedObjectProperties {
  objectType: "rectangle";
}

export type TiledObject =
  | EllipseObject
  | PointObject
  | PolygonObject
  | PolylineObject
  | TextObject
  | RectangleObject
  | ObjectTemplate;

export interface ObjectTemplate {
  objectType: "template";
  template: string;
  tileset?: Tileset;
  object: TiledObject;
}
