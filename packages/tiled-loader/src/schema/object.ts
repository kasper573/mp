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
  transform,
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

const commonProperties = object({
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
  properties: optional(array(property)),
});

export type EllipseObject = TypeOf<typeof ellipseObject>;
export const ellipseObject = giveDiscriminator(
  "ellipse",
  intersection([object({ ellipse: literal(true) }), commonProperties]),
);

export type PointObject = TypeOf<typeof pointObject>;
export const pointObject = giveDiscriminator(
  "point",
  intersection([object({ point: boolean }), commonProperties]),
);

export type PolygonObject = TypeOf<typeof polygonObject>;
export const polygonObject = giveDiscriminator(
  "polygon",
  intersection([object({ polygon: array(pixelVector) }), commonProperties]),
);

export type PolylineObject = TypeOf<typeof polylineObject>;
export const polylineObject = giveDiscriminator(
  "polyline",
  intersection([object({ polyline: array(pixelVector) }), commonProperties]),
);

export type TextObject = TypeOf<typeof textObject>;
export const textObject = giveDiscriminator(
  "text",
  intersection([object({ text: text }), commonProperties]),
);

export type RectangleObject = TypeOf<typeof rectangleObject>;
export const rectangleObject = giveDiscriminator("rectangle", commonProperties);

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
      ellipseObject,
      pointObject,
      polygonObject,
      polylineObject,
      textObject,
      rectangleObject,
      objectTemplate(context),
    ]),
  );
}

export interface ObjectTemplate {
  template: string;
  tileset?: Tileset;
  object: TiledObject;
  objectType: "objectTemplate";
}

export function objectTemplate(context: LoaderContext): Schema<ObjectTemplate> {
  return giveDiscriminator(
    "objectTemplate",
    object({
      template: file,
      tileset: optional(tilesetReference(context)),
      object: tiledObject(context),
    }),
  );
}

function giveDiscriminator<
  TypeName extends string,
  BaseSchema extends Schema<object>,
>(
  name: TypeName,
  base: BaseSchema,
): Schema<{ objectType: TypeName } & TypeOf<BaseSchema>> {
  return transform(base, (value) => ({
    ...value,
    objectType: name,
  }));
}
