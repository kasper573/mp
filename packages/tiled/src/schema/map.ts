import {
  array,
  boolean,
  variant,
  literal,
  object,
  optional,
  string,
  literalEnum,
  fallback,
  type TypeOf,
} from "@mp/schema";
import {
  color,
  compressionLevel,
  layerId,
  objectId,
  pixelUnit,
  tiledClass,
  tileUnit,
} from "./common";
import { layer } from "./layer";
import { property } from "./property";
import { tilesetReference } from "./tilesetReference";

export type MapRenderOrder = TypeOf<typeof mapRenderOrder>;
export const mapRenderOrder = literalEnum([
  "right-down",
  "right-up",
  "left-down",
  "left-up",
]);

export type StaggerAxis = TypeOf<typeof staggerAxis>;
export const staggerAxis = literalEnum(["x", "y"]);

export type StaggerIndex = TypeOf<typeof staggerIndex>;
export const staggerIndex = literalEnum(["odd", "even"]);

const sharedProperties = {
  type: literal("map"),
  version: string,
  tiledversion: string,

  tilesets: array(tilesetReference),
  properties: optional(array(property)),
  layers: array(layer),

  backgroundcolor: optional(color),
  class: optional(tiledClass),

  height: tileUnit,
  width: tileUnit,
  tileheight: tileUnit,
  tilewidth: tileUnit,

  parallaxoriginx: fallback(pixelUnit, 0),
  parallaxoriginy: fallback(pixelUnit, 0),

  /**
   * Whether the map has infinite dimensions
   */
  infinite: boolean,

  /**
   * The compression level to use for tile layer data
   */
  compressionlevel: fallback(compressionLevel, {
    type: "use-algorithm-default",
  }),

  /**
   * Auto-increments for each layer
   */
  nextlayerid: layerId,

  /**
   * Auto-increments for each placed object
   */
  nextobjectid: objectId,
};

export type OrthogonalMap = TypeOf<typeof orthogonalMap>;
export const orthogonalMap = object({
  renderorder: fallback(mapRenderOrder, "right-down"),
  orientation: literal("orthogonal"),
  ...sharedProperties,
});

export type IsometricMap = TypeOf<typeof isometricMap>;
export const isometricMap = object({
  orientation: literal("isometric"),
  ...sharedProperties,
});

export type StaggeredMap = TypeOf<typeof staggeredMap>;
export const staggeredMap = object({
  staggeraxis: staggerAxis,
  staggerindex: staggerIndex,
  orientation: literal("staggered"),
  ...sharedProperties,
});

export type HexagonalMap = TypeOf<typeof hexagonalMap>;
export const hexagonalMap = object({
  hexsidelength: pixelUnit,
  staggeraxis: staggerAxis,
  staggerindex: staggerIndex,
  orientation: literal("hexagonal"),
  ...sharedProperties,
});

export type TiledMap = TypeOf<typeof tiledMap>;
export const tiledMap = variant("orientation", [
  orthogonalMap,
  isometricMap,
  staggeredMap,
  hexagonalMap,
]);
