import type { Schema } from "@mp/schema";
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
import type { LoaderContext } from "../context";

export type Branded<T, Brand> = T & { __brand: Brand };

// Primitives
export type RGB = Branded<string, "RGB">;
export const rgb = string as unknown as Schema<RGB>;

export type ARGB = Branded<string, "ARGB">;
export const argb = string as unknown as Schema<ARGB>;

export type Color = RGB | ARGB;
export const color = union([argb, rgb]);

// Units
export type Index = Branded<number, "Index">;
export const index = integer as unknown as Schema<Index>;

export type TileUnit = Branded<number, "TileUnit">;
export const tileUnit = integer as unknown as Schema<TileUnit>;

export type PixelUnit = Branded<number, "PixelUnit">;
export const pixelUnit = float;

/**
 * 0-1
 */
export type Ratio = Branded<number, "Ratio">;
export const ratio = float;

export type Milliseconds = Branded<number, "Milliseconds">;
export const milliseconds = float;

/**
 * Angle in degrees clockwise
 */
export type Degrees = Branded<number, "Degrees">;
export const degrees = float;

export interface PixelVector {
  x: PixelUnit;
  y: PixelUnit;
}
export const pixelVector = object({
  x: pixelUnit,
  y: pixelUnit,
});

// Semantics
export type GlobalTileId = Branded<number, "GlobalTileId">;
export const globalTileID = integer;

export type LocalTileId = Branded<number, "LocalTileId">;
export const localTileID = integer;

export type TiledClass = Branded<number, "TiledClass">;
export const tiledClass = string;

export type File = Branded<string, "File">;
export function file(context: LoaderContext) {
  return pipe(
    string,
    transform(async (p) => context.relativePath(p, context.basePath)),
  );
}

export type ImageFile = Branded<string, "ImageFile">;
export const image = file;

export function readGlobalIdBuffer(buffer: Uint8Array, offset: number) {
  let i =
    buffer[offset] |
    (buffer[offset + 1] << 8) |
    (buffer[offset + 2] << 16) |
    (buffer[offset + 3] << 24);

  // Read out the flags
  const flippedHorizontally = (i & FLIPPED_HORIZONTALLY_FLAG) !== 0;
  const flippedVertically = (i & FLIPPED_VERTICALLY_FLAG) !== 0;
  const flippedDiagonally = (i & FLIPPED_DIAGONALLY_FLAG) !== 0;
  const rotatedHexagonal120 = (i & ROTATED_HEXAGONAL_120_FLAG) !== 0;

  // Clear all four flags
  i &= ~(
    FLIPPED_HORIZONTALLY_FLAG |
    FLIPPED_VERTICALLY_FLAG |
    FLIPPED_DIAGONALLY_FLAG |
    ROTATED_HEXAGONAL_120_FLAG
  );

  return {
    gid: i as GlobalTileId,
    newOffset: offset + 4,
    flags: {
      flippedHorizontally,
      flippedVertically,
      flippedDiagonally,
      rotatedHexagonal120,
    },
  };
}

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
const ROTATED_HEXAGONAL_120_FLAG = 0x10000000;

export function localToGlobalId(
  tilesetFirstGID: GlobalTileId,
  localId: LocalTileId,
): GlobalTileId {
  return (tilesetFirstGID + localId) as GlobalTileId;
}

export function globalToLocalId(
  tilesetFirstGID: GlobalTileId,
  globalId: GlobalTileId,
): LocalTileId {
  return (globalId - tilesetFirstGID) as LocalTileId;
}

// Complex

/**
 * array(integer): Uint8Array
 * string: encoded and compressed Uint8Array
 * (The encoding and compression should be defined alongside the data field)
 */
export type TiledData = Uint8Array | string;
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
export type Orientation =
  | "orthogonal"
  | "isometric"
  | "staggered"
  | "hexagonal";
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

export type Encoding = "csv" | "base64";
export const encoding = picklist(["csv", "base64"]);

/**
 * Incremental ID, unique across all objects
 */
export type ObjectId = Branded<number, "ObjectId">;
export const objectId = index;

/**
 * Incremental ID, unique across all layers
 */
export type LayerId = Branded<number, "LayerId">;
export const layerId = index;
