import { Vector } from "@mp/math";
import type { Pixel, Tile, Branded } from "@mp/std";
import * as v from "valibot";

// Primitives
export const RgbSchema = v.pipe(v.string(), v.brand("RGB"));
export type Rgb = v.InferOutput<typeof RgbSchema>;

export const ArgbSchema = v.pipe(v.string(), v.brand("ARGB"));
export type Argb = v.InferOutput<typeof ArgbSchema>;

export const ColorSchema = v.union([RgbSchema, ArgbSchema]);
export type Color = v.InferOutput<typeof ColorSchema>;

export const RatioSchema = v.pipe(v.number(), v.minValue(0), v.maxValue(1), v.brand("Ratio"));
export type Ratio = v.InferOutput<typeof RatioSchema>;

export const MillisecondsSchema = v.pipe(v.number(), v.minValue(0), v.brand("Milliseconds"));
export type Milliseconds = v.InferOutput<typeof MillisecondsSchema>;

export const DegreesSchema = v.pipe(v.number(), v.brand("Degrees"));
export type Degrees = v.InferOutput<typeof DegreesSchema>;

export const PixelSchema = v.pipe(v.number(), v.brand("Pixel"));
export const TileSchema = v.pipe(v.number(), v.brand("Tile"));

// Vector-based position and size
export const PositionSchema = v.pipe(
  v.object({
    x: PixelSchema,
    y: PixelSchema,
  }),
  v.transform(({ x, y }) => new Vector(x as Pixel, y as Pixel))
);
export type Position = v.InferOutput<typeof PositionSchema>;

export const SizeSchema = v.pipe(
  v.object({
    width: PixelSchema,
    height: PixelSchema,
  }),
  v.transform(({ width, height }) => new Vector(width as Pixel, height as Pixel))
);
export type Size = v.InferOutput<typeof SizeSchema>;

export const TileSizeSchema = v.pipe(
  v.object({
    width: TileSchema,
    height: TileSchema,
  }),
  v.transform(({ width, height }) => new Vector(width as Tile, height as Tile))
);
export type TileSize = v.InferOutput<typeof TileSizeSchema>;

export const TilePositionSchema = v.pipe(
  v.object({
    x: TileSchema,
    y: TileSchema,
  }),
  v.transform(({ x, y }) => new Vector(x as Tile, y as Tile))
);
export type TilePosition = v.InferOutput<typeof TilePositionSchema>;

// Legacy Coord type for backward compatibility
export const CoordSchema = v.object({
  x: PixelSchema,
  y: PixelSchema,
});
export type Coord = v.InferOutput<typeof CoordSchema>;

// Semantics
export const GlobalTileIdSchema = v.pipe(v.number(), v.brand("GlobalTileId"));
export type GlobalTileId = v.InferOutput<typeof GlobalTileIdSchema>;

export const LocalTileIdSchema = v.pipe(v.number(), v.brand("LocalTileId"));
export type LocalTileId = v.InferOutput<typeof LocalTileIdSchema>;

export const TiledClassSchema = v.pipe(v.string(), v.brand("TiledClass"));
export type TiledClass = v.InferOutput<typeof TiledClassSchema>;

export const FilePathSchema = v.pipe(v.string(), v.brand("FilePath"));
export type FilePath = v.InferOutput<typeof FilePathSchema>;

// Complex
export const TiledDataSchema = v.union([v.array(v.number()), v.string()]);
export type TiledData = v.InferOutput<typeof TiledDataSchema>;

export const CompressionLevelSchema = v.number();
export type CompressionLevel = v.InferOutput<typeof CompressionLevelSchema>;

// Enums
export const OrientationSchema = v.union([
  v.literal("orthogonal"),
  v.literal("isometric"),
  v.literal("staggered"),
  v.literal("hexagonal"),
]);
export type Orientation = v.InferOutput<typeof OrientationSchema>;

export const CompressionSchema = v.union([
  v.literal("zlib"),
  v.literal("gzip"),
  v.literal("zstd"),
  v.literal(""),
]);
export type Compression = v.InferOutput<typeof CompressionSchema>;

export const EncodingSchema = v.union([v.literal("csv"), v.literal("base64")]);
export type Encoding = v.InferOutput<typeof EncodingSchema>;

export const ObjectIdSchema = v.pipe(v.number(), v.brand("ObjectId"));
export type ObjectId = v.InferOutput<typeof ObjectIdSchema>;

export const LayerIdSchema = v.pipe(v.number(), v.brand("LayerId"));
export type LayerId = v.InferOutput<typeof LayerIdSchema>;

export const MapRenderOrderSchema = v.union([
  v.literal("right-down"),
  v.literal("right-up"),
  v.literal("left-down"),
  v.literal("left-up"),
]);
export type MapRenderOrder = v.InferOutput<typeof MapRenderOrderSchema>;

export const StaggerAxisSchema = v.union([v.literal("x"), v.literal("y")]);
export type StaggerAxis = v.InferOutput<typeof StaggerAxisSchema>;

export const StaggerIndexSchema = v.union([v.literal("odd"), v.literal("even")]);
export type StaggerIndex = v.InferOutput<typeof StaggerIndexSchema>;

export const FillModeSchema = v.union([
  v.literal("stretch"),
  v.literal("preserve-aspect-fit"),
]);
export type FillMode = v.InferOutput<typeof FillModeSchema>;

export const ObjectAlignmentSchema = v.union([
  v.literal("unspecified"),
  v.literal("topleft"),
  v.literal("top"),
  v.literal("topright"),
  v.literal("left"),
  v.literal("center"),
  v.literal("right"),
  v.literal("bottomleft"),
  v.literal("bottom"),
  v.literal("bottomright"),
]);
export type ObjectAlignment = v.InferOutput<typeof ObjectAlignmentSchema>;

export const TileRenderSizeSchema = v.union([v.literal("tile"), v.literal("grid")]);
export type TileRenderSize = v.InferOutput<typeof TileRenderSizeSchema>;

export const LayerDrawOrderSchema = v.union([v.literal("topdown"), v.literal("index")]);
export type LayerDrawOrder = v.InferOutput<typeof LayerDrawOrderSchema>;

export const WangColorIndexSchema = v.pipe(v.number(), v.brand("WangColorIndex"));
export type WangColorIndex = v.InferOutput<typeof WangColorIndexSchema>;