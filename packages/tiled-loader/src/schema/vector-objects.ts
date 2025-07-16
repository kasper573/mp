import * as v from "valibot";
import {
  PositionAndSizeSchema,
  CoordinatePathSchema,
  type Position,
  type Size,
  type CoordinatePath,
} from "./vector-types";
import type { GlobalTileId, ObjectId, Degrees, TiledClass } from "./common";
import type { PropertyMap } from "./property";
import type { TiledText } from "./text";

/**
 * Vector-based object interfaces (transformed from Tiled JSON)
 */
export interface VectorTiledObject {
  id: ObjectId;
  name: string;
  position: Position;
  size: Size;
  rotation: Degrees;
  type?: TiledClass;
  visible: boolean;
  properties: PropertyMap;
  gid?: GlobalTileId;
}

export interface VectorEllipseObject extends VectorTiledObject {
  objectType: "ellipse";
}

export interface VectorPointObject extends VectorTiledObject {
  objectType: "point";
}

export interface VectorPolygonObject extends VectorTiledObject {
  objectType: "polygon";
  polygon: CoordinatePath;
}

export interface VectorPolylineObject extends VectorTiledObject {
  objectType: "polyline";
  polyline: CoordinatePath;
}

export interface VectorRectangleObject extends VectorTiledObject {
  objectType: "rectangle";
}

export interface VectorTextObject extends VectorTiledObject {
  objectType: "text";
  text: TiledText;
}

export interface VectorTileObject extends VectorTiledObject {
  objectType: "tile";
  gid: GlobalTileId;
}

export type VectorTiledObjectUnion =
  | VectorEllipseObject
  | VectorPointObject
  | VectorPolygonObject
  | VectorPolylineObject
  | VectorRectangleObject
  | VectorTextObject
  | VectorTileObject;

/**
 * Valibot schemas for parsing Tiled JSON objects and transforming to Vector types
 */

// Base schema for common object properties
const BaseObjectSchema = v.object({
  id: v.pipe(
    v.number(),
    v.transform((n) => n as ObjectId),
  ),
  name: v.string(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  rotation: v.pipe(
    v.number(),
    v.transform((n) => n as Degrees),
  ),
  type: v.optional(
    v.pipe(
      v.string(),
      v.transform((s) => s as TiledClass),
    ),
  ),
  visible: v.boolean(),
  properties: v.optional(v.array(v.any()), []), // Will be transformed by property schema
  gid: v.optional(
    v.pipe(
      v.number(),
      v.transform((n) => n as GlobalTileId),
    ),
  ),
});

// Transform base object data to Vector types
const TransformBaseObject = v.pipe(
  BaseObjectSchema,
  v.transform(({ x, y, width, height, ...rest }) => ({
    ...rest,
    position: { x, y },
    size: { width, height },
  })),
  v.transform(({ position, size, ...rest }) => ({
    ...rest,
    position: v.parse(PositionAndSizeSchema, { ...position, ...size }).position,
    size: v.parse(PositionAndSizeSchema, { ...position, ...size }).size,
    properties: {} as PropertyMap, // TODO: Transform properties
  })),
);

// Point object (has point: true)
export const VectorPointObjectSchema = v.pipe(
  v.intersect([
    TransformBaseObject,
    v.object({
      point: v.literal(true),
    }),
  ]),
  v.transform(
    (obj): VectorPointObject => ({
      ...obj,
      objectType: "point",
    }),
  ),
);

// Ellipse object (has ellipse: true)
export const VectorEllipseObjectSchema = v.pipe(
  v.intersect([
    TransformBaseObject,
    v.object({
      ellipse: v.literal(true),
    }),
  ]),
  v.transform(
    (obj): VectorEllipseObject => ({
      ...obj,
      objectType: "ellipse",
    }),
  ),
);

// Polygon object (has polygon array)
export const VectorPolygonObjectSchema = v.pipe(
  v.intersect([
    TransformBaseObject,
    v.object({
      polygon: CoordinatePathSchema,
    }),
  ]),
  v.transform(
    (obj): VectorPolygonObject => ({
      ...obj,
      objectType: "polygon",
    }),
  ),
);

// Polyline object (has polyline array)
export const VectorPolylineObjectSchema = v.pipe(
  v.intersect([
    TransformBaseObject,
    v.object({
      polyline: CoordinatePathSchema,
    }),
  ]),
  v.transform(
    (obj): VectorPolylineObject => ({
      ...obj,
      objectType: "polyline",
    }),
  ),
);

// Text object (has text object)
export const VectorTextObjectSchema = v.pipe(
  v.intersect([
    TransformBaseObject,
    v.object({
      text: v.any(), // TODO: Define text schema
    }),
  ]),
  v.transform(
    (obj): VectorTextObject => ({
      ...obj,
      objectType: "text",
    }),
  ),
);

// Tile object (has gid)
export const VectorTileObjectSchema = v.pipe(
  v.intersect([
    TransformBaseObject,
    v.object({
      gid: v.pipe(
        v.number(),
        v.transform((n) => n as GlobalTileId),
      ),
    }),
  ]),
  v.transform(
    (obj): VectorTileObject => ({
      ...obj,
      objectType: "tile",
      gid: obj.gid ?? (0 as GlobalTileId), // Provide default if undefined
    }),
  ),
);

// Rectangle object (default case)
export const VectorRectangleObjectSchema = v.pipe(
  TransformBaseObject,
  v.transform(
    (obj): VectorRectangleObject => ({
      ...obj,
      objectType: "rectangle",
    }),
  ),
);

// Union schema that determines object type based on properties
export const VectorTiledObjectSchema = v.union([
  VectorPointObjectSchema,
  VectorEllipseObjectSchema,
  VectorPolygonObjectSchema,
  VectorPolylineObjectSchema,
  VectorTextObjectSchema,
  VectorTileObjectSchema,
  VectorRectangleObjectSchema, // Default case, should be last
]);
