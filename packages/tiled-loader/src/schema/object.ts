import type { Schema } from "@mp/schema";
import {
  array,
  boolean,
  intersection,
  lazy,
  literal,
  object,
  optional,
  string,
  union,
} from "@mp/schema";
import type { LoaderContext } from "../context";
import type {
  GlobalTileId,
  ObjectId,
  PixelUnit,
  PixelVector,
  Degrees,
  TiledClass,
} from "./common";
import {
  file,
  globalTileID,
  objectId,
  pixelUnit,
  pixelVector,
  degrees,
  tiledClass,
} from "./common";
import type { Property } from "./property";
import { property } from "./property";
import type { TiledText } from "./text";
import { text } from "./text";
import { tilesetReference } from "./tilesetReference";
import type { Tileset } from "./tileset";

export interface SharedObjectProperties {
  gid?: GlobalTileId;
  id: ObjectId;
  name: string;
  x: PixelUnit;
  y: PixelUnit;
  height: PixelUnit;
  width: PixelUnit;
  rotation: Degrees;
  type?: TiledClass;
  visible: boolean;
  properties?: Property[];
}

function commonProperties(context: LoaderContext) {
  return object({
    /**
     * Set if object represents a tile
     */
    gid: optional(globalTileID),
    id: objectId,
    name: string,
    x: pixelUnit,
    y: pixelUnit,
    height: pixelUnit,
    width: pixelUnit,
    rotation: degrees,
    type: optional(tiledClass),
    visible: boolean,
    properties: optional(array(property(context))),
  });
}

export interface EllipseObject extends SharedObjectProperties {
  ellipse: boolean;
}

export const ellipseObject = objectType(object({ ellipse: literal(true) }));

export interface PointObject extends SharedObjectProperties {
  point: boolean;
}

export const pointObject = objectType(object({ point: boolean }));

export interface PolygonObject extends SharedObjectProperties {
  polygon: PixelVector[];
}

export const polygonObject = objectType(
  object({ polygon: array(pixelVector) }),
);

export interface PolylineObject extends SharedObjectProperties {
  polyline: PixelVector[];
}

export const polylineObject = objectType(
  object({ polyline: array(pixelVector) }),
);

export interface TextObject extends SharedObjectProperties {
  text: TiledText;
}

export const textObject = objectType(object({ text }));

export interface RectangleObject extends SharedObjectProperties {
  rectangle: true;
}

export const rectangleObject = objectType(
  object({}) as Schema<RectangleObject>,
);

export type TiledObject =
  | EllipseObject
  | PointObject
  | PolygonObject
  | PolylineObject
  | TextObject
  | RectangleObject
  | ObjectTemplate;

export function tiledObject(context: LoaderContext): Schema<TiledObject> {
  return lazy(() =>
    union([
      ellipseObject(context),
      pointObject(context),
      polygonObject(context),
      polylineObject(context),
      textObject(context),
      rectangleObject(context),
      objectTemplate(context),
    ]),
  );
}

export interface ObjectTemplate {
  template: string;
  tileset?: Tileset;
  object: TiledObject;
}

export function objectTemplate(context: LoaderContext): Schema<ObjectTemplate> {
  return object({
    template: file(context),
    tileset: optional(tilesetReference(context)),
    object: tiledObject(context),
  });
}

function objectType<Base>(base: Schema<Base>) {
  return function define(
    context: LoaderContext,
  ): Schema<Base & SharedObjectProperties> {
    return intersection([base, commonProperties(context)]);
  };
}
