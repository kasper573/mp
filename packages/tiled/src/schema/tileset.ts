import type { TypeOf } from "@mp/schema";
import {
  array,
  object,
  optional,
  string,
  literalEnum,
  fallback,
} from "@mp/schema";
import {
  color,
  globalTileID,
  image,
  pixelUnit,
  pixelVector,
  rgb,
  tiledClass,
  tileUnit,
} from "./common";
import { property } from "./property";
import { wangSet } from "./wang";
import { terrain } from "./terrain";
import { tile } from "./tile";
import { transformations } from "./transformations";
import { grid } from "./grid";

export type FillMode = TypeOf<typeof fillMode>;
export const fillMode = literalEnum(["stretch", "preserve-aspect-fit"]);

export type ObjectAlignment = TypeOf<typeof objectAlignment>;
export const objectAlignment = literalEnum([
  "unspecified",
  "topleft",
  "top",
  "topright",
  "left",
  "center",
  "right",
  "bottomleft",
  "bottom",
  "bottomright",
]);

export type TileRenderSize = TypeOf<typeof tileRenderSize>;
export const tileRenderSize = literalEnum(["tile", "grid"]);

export type Tileset = TypeOf<typeof tileset>;
export const tileset = object({
  backgroundcolor: optional(color),
  class: optional(tiledClass),
  columns: tileUnit,
  fillmode: fallback(fillMode, "stretch"),
  firstgid: fallback(globalTileID, 1),
  grid: optional(grid),

  image,
  imageheight: pixelUnit,
  imagewidth: pixelUnit,

  /**
   * Buffer between image edge and first tile (pixels)
   */
  margin: pixelUnit,

  name: string,
  objectalignment: fallback(objectAlignment, "unspecified"),

  properties: optional(array(property)),

  /**
   * Spacing between adjacent tiles in image (pixels)
   */
  spacing: pixelUnit,

  terrains: optional(array(terrain)),

  /**
   * The number of tiles in this tileset
   */
  tilecount: tileUnit,

  /**
   * The Tiled version used to save the file
   */
  tiledversion: string,

  /**
   * Maximum height of tiles in this set
   */
  tileheight: optional(tileUnit),
  /**
   * Maximum width of tiles in this set
   */
  tilewidth: optional(tileUnit),

  tileoffset: optional(pixelVector),

  tilerendersize: fallback(tileRenderSize, "tile"),

  tiles: optional(array(tile)),

  /**
   * Allowed transformations
   */
  transformations: optional(transformations),

  transparentcolor: optional(rgb),

  /**
   * The JSON format version
   */
  version: optional(string),

  wangsets: optional(array(wangSet)),
});
