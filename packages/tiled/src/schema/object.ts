import type { TypeOf } from "@mp/schema";
import {
  array,
  boolean,
  intersection,
  literal,
  object,
  optional,
  string,
  transform,
  union,
} from "@mp/schema";
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
export const ellipseObject = intersection([
  object({ ellipse: literal(true) }),
  commonProperties,
]);

export type PointObject = TypeOf<typeof pointObject>;
export const pointObject = intersection([
  object({ point: boolean }),
  commonProperties,
]);

export type PolygonObject = TypeOf<typeof polygonObject>;
export const polygonObject = intersection([
  object({ polygon: array(pixelVector) }),
  commonProperties,
]);

export type PolylineObject = TypeOf<typeof polylineObject>;
export const polylineObject = intersection([
  object({ polyline: array(pixelVector) }),
  commonProperties,
]);

export type TextObject = TypeOf<typeof textObject>;
export const textObject = intersection([
  object({ text: text }),
  commonProperties,
]);

export type RectangleObject = TypeOf<typeof rectangleObject>;
export const rectangleObject = transform(commonProperties, (data) => ({
  data,
  rectangle: true,
}));

export type TiledObject = TypeOf<typeof tiledObject>;
export const tiledObject = union([
  ellipseObject,
  pointObject,
  polygonObject,
  polylineObject,
  textObject,
  rectangleObject,
]);

export type ObjectTemplate = TypeOf<typeof objectTemplate>;
export const objectTemplate = object({
  template: file,
  tileset: optional(tilesetReference),
  object: tiledObject,
});
