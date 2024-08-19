import {
  array,
  boolean,
  variant,
  literal,
  object,
  optional,
  string,
  fallback,
  picklist,
} from "@mp/schema";
import type { LoaderContext } from "../context";
import type {
  Color,
  CompressionLevel,
  LayerId,
  ObjectId,
  PixelUnit,
  TiledClass,
  TileUnit,
} from "./common";
import {
  color,
  compressionLevel,
  layerId,
  objectId,
  pixelUnit,
  tiledClass,
  tileUnit,
} from "./common";
import type { Layer } from "./layer";
import { layer } from "./layer";
import type { Property } from "./property";
import { property } from "./property";
import { tilesetReference } from "./tilesetReference";
import type { Tileset } from "./tileset";

export type MapRenderOrder =
  | "right-down"
  | "right-up"
  | "left-down"
  | "left-up";
export const mapRenderOrder = picklist([
  "right-down",
  "right-up",
  "left-down",
  "left-up",
]);

export type StaggerAxis = "x" | "y";
export const staggerAxis = picklist(["x", "y"]);

export type StaggerIndex = "odd" | "even";
export const staggerIndex = picklist(["odd", "even"]);

interface SharedMapProperties {
  type: "map";
  version: string;
  tiledversion: string;

  tilesets: Tileset[];
  properties?: Property[];
  layers: Layer[];

  backgroundcolor?: Color;
  class?: TiledClass;

  height: TileUnit;
  width: TileUnit;
  tileheight: TileUnit;
  tilewidth: TileUnit;

  parallaxoriginx: PixelUnit;
  parallaxoriginy: PixelUnit;

  /**
   * Whether the map has infinite dimensions
   */
  infinite: boolean;

  /**
   * The compression level to use for tile layer data
   */
  compressionlevel: CompressionLevel;

  /**
   * Auto-increments for each layer
   */
  nextlayerid: LayerId;

  /**
   * Auto-increments for each placed object
   */
  nextobjectid: ObjectId;
}

function sharedProperties(context: LoaderContext) {
  return {
    type: literal("map"),
    version: string,
    tiledversion: string,

    tilesets: array(tilesetReference(context)),
    properties: optional(array(property(context))),
    layers: array(layer(context)),

    backgroundcolor: optional(color),
    class: optional(tiledClass),

    height: tileUnit,
    width: tileUnit,
    tileheight: tileUnit,
    tilewidth: tileUnit,

    parallaxoriginx: fallback(pixelUnit, 0),
    parallaxoriginy: fallback(pixelUnit, 0),

    infinite: boolean,

    compressionlevel: fallback(compressionLevel, {
      type: "use-algorithm-default",
    }),

    nextlayerid: layerId,

    nextobjectid: objectId,
  };
}

export interface OrthogonalMap extends SharedMapProperties {
  renderorder: MapRenderOrder;
  orientation: "orthogonal";
}

export function orthogonalMap(context: LoaderContext) {
  return object({
    renderorder: fallback(mapRenderOrder, "right-down"),
    orientation: literal("orthogonal"),
    ...sharedProperties(context),
  });
}

export interface IsometricMap extends SharedMapProperties {
  orientation: "isometric";
}

export function isometricMap(context: LoaderContext) {
  return object({
    orientation: literal("isometric"),
    ...sharedProperties(context),
  });
}

export interface StaggeredMap extends SharedMapProperties {
  staggeraxis: StaggerAxis;
  staggerindex: StaggerIndex;
  orientation: "staggered";
}

export function staggeredMap(context: LoaderContext) {
  return object({
    staggeraxis: staggerAxis,
    staggerindex: staggerIndex,
    orientation: literal("staggered"),
    ...sharedProperties(context),
  });
}

export interface HexagonalMap extends SharedMapProperties {
  hexsidelength: PixelUnit;
  staggeraxis: StaggerAxis;
  staggerindex: StaggerIndex;
  orientation: "hexagonal";
}

export function hexagonalMap(context: LoaderContext) {
  return object({
    hexsidelength: pixelUnit,
    staggeraxis: staggerAxis,
    staggerindex: staggerIndex,
    orientation: literal("hexagonal"),
    ...sharedProperties(context),
  });
}

export type TiledMap =
  | OrthogonalMap
  | IsometricMap
  | StaggeredMap
  | HexagonalMap;

export function tiledMap(context: LoaderContext) {
  return variant("orientation", [
    orthogonalMap(context),
    isometricMap(context),
    staggeredMap(context),
    hexagonalMap(context),
  ]);
}
