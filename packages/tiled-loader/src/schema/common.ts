import {
  float,
  integer,
  object,
  string,
  nativeEnum,
  union,
  transform,
  array,
  picklist,
} from "@mp/schema";

// Primitives
export const rgb = string;
export const argb = string;
export const color = union([argb, rgb]);

// Units
export const index = integer;
export const tileUnit = integer;
export const pixelUnit = float;
export const milliseconds = float;
/**
 * Angle in degrees clockwise
 */
export const rotation = float;
export const pixelVector = object({
  x: pixelUnit,
  y: pixelUnit,
});

// Semantics
export const globalTileID = integer;
export const localTileID = integer;
export const tiledClass = string;
export const file = string;
export const image = file;

// Complex
/**
 * When it's a string then it's array of GID encoded and compressed by something.
 * The encoding and compression should be defined alongside the data field.
 */
export const data = union([array(globalTileID), string]);

export type CompressionLevel =
  | { type: "specific"; value: number }
  | { type: "use-algorithm-default" };

export const compressionLevel = transform(
  float,
  (value): CompressionLevel =>
    value === -1
      ? { type: "use-algorithm-default" }
      : { type: "specific", value },
);

// Enums
export const orientation = picklist([
  "orthogonal",
  "isometric",
  "staggered",
  "hexagonal",
]);

export enum Compression {
  Zlib = "zlib",
  Gzip = "gzip",
  Zstd = "zstd",
  None = "",
}

export const compression = nativeEnum(Compression);

export const encoding = picklist(["csv", "base64"]);

/**
 * Incremental ID, unique across all objects
 */
export const objectId = index;

/**
 * Incremental ID, unique across all layers
 */
export const layerId = index;
