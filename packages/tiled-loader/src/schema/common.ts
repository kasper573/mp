import type { Branded, Parser, TypeOf } from "@mp/schema";
import {
  array,
  branded,
  oneOf,
  float,
  integer,
  object,
  string,
  union,
} from "@mp/schema";

// Primitives
export type RGB = TypeOf<typeof rgb>;
export const rgb = branded<string, "RGB">(string);

export type ARGB = TypeOf<typeof argb>;
export const argb = branded<string, "ARGB">(string);

export type Color = TypeOf<typeof color>;
export const color = union([argb, rgb]);

// Units
export type TileNumber = TypeOf<typeof tileNumber>;
export const tileNumber = branded<number, "TileUnit">(integer);

export type Pixel = TypeOf<typeof pixel>;
export const pixel = branded<number, "PixelUnit">(float);

/**
 * 0-1
 */
export type Ratio = TypeOf<typeof ratio>;
export const ratio = branded<number, "Ratio">(float);

export type Milliseconds = TypeOf<typeof milliseconds>;
export const milliseconds = branded<number, "Milliseconds">(float);

export type Degrees = TypeOf<typeof degrees>;
export const degrees = branded<number, "Degrees">(float);

export type Coord = TypeOf<typeof coord>;
export const coord = object({ x: pixel, y: pixel });

// Semantics
export type GlobalTileId = TypeOf<typeof globalTileID>;
export const globalTileID = branded<number, "GlobalTileId">(integer);

export type LocalTileId = TypeOf<typeof localTileID>;
export const localTileID = branded<number, "LocalTileId">(integer);

export type TiledClass = TypeOf<typeof tiledClass>;
export const tiledClass = branded<string, "TiledClass">(string);

export type FilePath = Branded<string, "FilePath">;

// Complex

/**
 * array(integer): Uint8Array
 * string: encoded and compressed Uint8Array
 * (The encoding and compression should be defined alongside the data field)
 */
export type TiledData = TypeOf<typeof data>;
export const data = union([array(integer), string]);

export type CompressionLevel =
  | { type: "specific"; value: number }
  | { type: "use-algorithm-default" };

export const compressionLevel: Parser<CompressionLevel> = (input) => {
  const value = float(input);
  return value === -1
    ? { type: "use-algorithm-default" }
    : { type: "specific", value };
};

// Enums
export type Orientation = TypeOf<typeof orientation>;

export const orientation = oneOf([
  "orthogonal",
  "isometric",
  "staggered",
  "hexagonal",
]);

export type Compression = "zlib" | "gzip" | "zstd" | "none";

export const compression: Parser<Compression> = (input) => {
  const value = string(input);
  return value ? (value as Compression) : "none";
};

export type Encoding = TypeOf<typeof encoding>;
export const encoding = oneOf(["csv", "base64"]);

/**
 * Incremental ID, unique across all objects
 */
export type ObjectId = TypeOf<typeof objectId>;
export const objectId = branded<number, "ObjectId">(integer);

/**
 * Incremental ID, unique across all layers
 */
export type LayerId = TypeOf<typeof layerId>;
export const layerId = branded<number, "LayerId">(integer);

export type MapRenderOrder = TypeOf<typeof mapRenderOrder>;

export const mapRenderOrder = oneOf([
  "right-down",
  "right-up",
  "left-down",
  "left-up",
]);

export type StaggerAxis = TypeOf<typeof staggerAxis>;
export const staggerAxis = oneOf(["x", "y"]);

export type StaggerIndex = TypeOf<typeof staggerIndex>;
export const staggerIndex = oneOf(["odd", "even"]);

export type FillMode = TypeOf<typeof fillMode>;
export const fillMode = oneOf(["stretch", "preserve-aspect-fit"]);

export type ObjectAlignment = TypeOf<typeof objectAlignment>;
export const objectAlignment = oneOf([
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
export const tileRenderSize = oneOf(["tile", "grid"]);

export type LayerDrawOrder = TypeOf<typeof layerDrawOrder>;
export const layerDrawOrder = oneOf(["topdown", "index"]);

export type WangColorIndex = Branded<number, "WangColorIndex">;
