import type { TypeOf } from "@mp/schema";
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
  pipe,
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
export type GlobalTileId = typeof globalTileID;
export const globalTileID = integer;
export type LocalTileId = typeof localTileID;
export const localTileID = integer;
export const tiledClass = string;
export const file = string;
export const image = file;

// Complex

/**
 * array(integer): Uint8Array
 * string: encoded and compressed Uint8Array
 * (The encoding and compression should be defined alongside the data field)
 */
export const data = union([array(integer), string]);

export type CompressionLevel =
  | { type: "specific"; value: number }
  | { type: "use-algorithm-default" };

export const compressionLevel = pipe(
  float,
  transform(
    async (value): Promise<CompressionLevel> =>
      value === -1
        ? { type: "use-algorithm-default" }
        : { type: "specific", value },
  ),
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

export type Encoding = TypeOf<typeof encoding>;
export const encoding = picklist(["csv", "base64"]);

/**
 * Incremental ID, unique across all objects
 */
export const objectId = index;

/**
 * Incremental ID, unique across all layers
 */
export const layerId = index;
