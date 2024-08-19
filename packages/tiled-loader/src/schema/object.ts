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
  ellipse: boolean;
}

export interface PointObject extends SharedObjectProperties {
  point: boolean;
}

export interface PolygonObject extends SharedObjectProperties {
  polygon: Coord[];
}

export interface PolylineObject extends SharedObjectProperties {
  polyline: Coord[];
}

export interface TextObject extends SharedObjectProperties {
  text: TiledText;
}

export interface RectangleObject extends SharedObjectProperties {
  rectangle: true;
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
  template: string;
  tileset?: Tileset;
  object: TiledObject;
}
