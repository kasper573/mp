import type { Pixel } from "@mp/std";
import type {
  GlobalTileId,
  ObjectId,
  Coord,
  Degrees,
  TiledClass,
} from "./common";

import type { PropertyMap } from "./property";
import type { TiledText } from "./text";
import type { GlobalIdFlags } from "../gid";

export interface SharedObjectProperties {
  gid?: GlobalTileId;
  /**
   * If the gid was set, these are the flags that it contained.
   */
  gidFlags?: GlobalIdFlags;
  id: ObjectId;
  name: string;
  x: Pixel;
  y: Pixel;
  height: Pixel;
  width: Pixel;
  rotation: Degrees;
  type?: TiledClass;
  visible: boolean;
  properties: PropertyMap;
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
  | RectangleObject;
