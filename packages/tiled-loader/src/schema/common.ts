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
import type { LoaderContext } from "../context";

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
export function base64Buffer(context: LoaderContext) {
  return transform(string, context.readBase64);
}

export function data(context: LoaderContext) {
  return union([array(globalTileID), base64Buffer(context)]);
}

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