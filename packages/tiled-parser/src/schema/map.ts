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
import type { LoaderContext } from "../context";
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

function sharedProperties(context: LoaderContext) {
  return {
    type: literal("map"),
    version: string,
    tiledversion: string,

    tilesets: array(tilesetReference(context)),
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
}

export type OrthogonalMap = TypeOf<ReturnType<typeof orthogonalMap>>;
export function orthogonalMap(context: LoaderContext) {
  return object({
    renderorder: fallback(mapRenderOrder, "right-down"),
    orientation: literal("orthogonal"),
    ...sharedProperties(context),
  });
}

export type IsometricMap = TypeOf<ReturnType<typeof isometricMap>>;
export function isometricMap(context: LoaderContext) {
  return object({
    orientation: literal("isometric"),
    ...sharedProperties(context),
  });
}

export type StaggeredMap = TypeOf<ReturnType<typeof staggeredMap>>;
export function staggeredMap(context: LoaderContext) {
  return object({
    staggeraxis: staggerAxis,
    staggerindex: staggerIndex,
    orientation: literal("staggered"),
    ...sharedProperties(context),
  });
}

export type HexagonalMap = TypeOf<ReturnType<typeof hexagonalMap>>;
export function hexagonalMap(context: LoaderContext) {
  return object({
    hexsidelength: pixelUnit,
    staggeraxis: staggerAxis,
    staggerindex: staggerIndex,
    orientation: literal("hexagonal"),
    ...sharedProperties(context),
  });
}

export type TiledMap = TypeOf<ReturnType<typeof tiledMap>>;
export function tiledMap(context: LoaderContext) {
  return variant("orientation", [
    orthogonalMap(context),
    isometricMap(context),
    staggeredMap(context),
    hexagonalMap(context),
  ]);
}
