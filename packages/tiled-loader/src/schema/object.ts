import type { Pixel } from "@mp/std";
import type {
  GlobalTileId,
  ObjectId,
  Coord,
  Degrees,
  TiledClass,
} from "./common";
import type {
  Position as VectorPosition,
  Size,
  CoordinatePath,
} from "./vector-types";

import type { PropertyMap } from "./property";
import type { TiledText } from "./text";

/**
 * @deprecated Use SharedVectorObjectProperties instead
 */
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
  properties: PropertyMap;
}

/**
 * Enhanced object properties using Vector types for better performance and convenience
 */
export interface SharedVectorObjectProperties {
  gid?: GlobalTileId;
  id: ObjectId;
  name: string;
  position: VectorPosition;
  size: Size;
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

// New Vector-based object types for better performance and convenience

export interface VectorEllipseObject extends SharedVectorObjectProperties {
  objectType: "ellipse";
}

export interface VectorPointObject extends SharedVectorObjectProperties {
  objectType: "point";
}

export interface VectorPolygonObject extends SharedVectorObjectProperties {
  objectType: "polygon";
  polygon: CoordinatePath;
}

export interface VectorPolylineObject extends SharedVectorObjectProperties {
  objectType: "polyline";
  polyline: CoordinatePath;
}

export interface VectorTextObject extends SharedVectorObjectProperties {
  objectType: "text";
  text: TiledText;
}

export interface VectorRectangleObject extends SharedVectorObjectProperties {
  objectType: "rectangle";
}

export type VectorTiledObject =
  | VectorEllipseObject
  | VectorPointObject
  | VectorPolygonObject
  | VectorPolylineObject
  | VectorTextObject
  | VectorRectangleObject;
