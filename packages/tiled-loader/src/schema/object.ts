import type { Schema, TypeOf } from "@mp/schema";
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
import {
  file,
  globalTileID,
  objectId,
  pixelUnit,
  pixelVector,
  rotation,
  tiledClass,
} from "./common";
import { property } from "./property";
import { text } from "./text";
import { tilesetReference } from "./tilesetReference";
import type { Tileset } from "./tileset";

type CommonProperties = TypeOf<ReturnType<typeof commonProperties>>;
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
    rotation,
    type: optional(tiledClass),
    visible: boolean,
    properties: optional(array(property(context))),
  });
}

export type EllipseObject = TypeOf<ReturnType<typeof ellipseObject>>;
export const ellipseObject = objectType(object({ ellipse: literal(true) }));

export type PointObject = TypeOf<ReturnType<typeof pointObject>>;
export const pointObject = objectType(object({ point: boolean }));

export type PolygonObject = TypeOf<ReturnType<typeof polygonObject>>;
export const polygonObject = objectType(
  object({ polygon: array(pixelVector) }),
);

export type PolylineObject = TypeOf<ReturnType<typeof polylineObject>>;
export const polylineObject = objectType(
  object({ polyline: array(pixelVector) }),
);

export type TextObject = TypeOf<ReturnType<typeof textObject>>;
export const textObject = objectType(object({ text }));

export type RectangleObject = TypeOf<ReturnType<typeof rectangleObject>>;
export const rectangleObject = objectType(object({}));

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
  ): Schema<Base & CommonProperties> {
    return intersection([base, commonProperties(context)]);
  };
}
