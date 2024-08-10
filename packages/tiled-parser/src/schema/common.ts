import {
  float,
  integer,
  object,
  string,
  literalEnum,
  nativeEnum,
  union,
  transform,
  array,
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
// export const base64Buffer = transform(string, (str) =>
//   Buffer.from(str, "base64"),
// );
export const base64Buffer = transform(string, (str) =>
  Buffer.from(str, "base64"),
);
export const data = union([array(globalTileID), base64Buffer]);

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
export const orientation = literalEnum([
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

export const encoding = literalEnum(["csv", "base64"]);

/**
 * Incremental ID, unique across all objects
 */
export const objectId = index;

/**
 * Incremental ID, unique across all layers
 */
export const layerId = index;
