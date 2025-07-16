import * as v from "valibot";
import { Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";

/**
 * Vector types for the transformed data structure
 */
export type Position = Vector<Pixel>;
export type Size = Vector<Pixel>;
export type TilePosition = Vector<Tile>;
export type TileSize = Vector<Tile>;
export type CoordinatePath = readonly Position[];

/**
 * Helper functions to create Vector instances
 */
export function createPosition(x: number, y: number): Position {
  return new Vector<Pixel>(x as Pixel, y as Pixel);
}

export function createSize(width: number, height: number): Size {
  return new Vector<Pixel>(width as Pixel, height as Pixel);
}

export function createTilePosition(x: number, y: number): TilePosition {
  return new Vector<Tile>(x as Tile, y as Tile);
}

export function createTileSize(width: number, height: number): TileSize {
  return new Vector<Tile>(width as Tile, height as Tile);
}

/**
 * Valibot schemas for transforming raw Tiled JSON data to Vector types
 */

// Transform {x, y} to Position (Vector<Pixel>)
export const PositionSchema = v.pipe(
  v.object({
    x: v.number(),
    y: v.number(),
  }),
  v.transform(({ x, y }) => createPosition(x, y)),
);

// Transform {width, height} to Size (Vector<Pixel>)
export const SizeSchema = v.pipe(
  v.object({
    width: v.number(),
    height: v.number(),
  }),
  v.transform(({ width, height }) => createSize(width, height)),
);

// Transform {x, y, width, height} to {position: Position, size: Size}
export const PositionAndSizeSchema = v.pipe(
  v.object({
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
  }),
  v.transform(({ x, y, width, height }) => ({
    position: createPosition(x, y),
    size: createSize(width, height),
  })),
);

// Transform map dimensions to TileSize
export const MapTileSizeSchema = v.pipe(
  v.object({
    width: v.number(),
    height: v.number(),
  }),
  v.transform(({ width, height }) => createTileSize(width, height)),
);

// Transform tile dimensions to Size (Vector<Pixel>)
export const TileSizeSchema = v.pipe(
  v.object({
    tilewidth: v.number(),
    tileheight: v.number(),
  }),
  v.transform(({ tilewidth, tileheight }) => createSize(tilewidth, tileheight)),
);

// Transform array of {x, y} coordinates to CoordinatePath
export const CoordinatePathSchema = v.pipe(
  v.array(
    v.object({
      x: v.number(),
      y: v.number(),
    }),
  ),
  v.transform(
    (coords) =>
      coords.map(({ x, y }) => createPosition(x, y)) as CoordinatePath,
  ),
);
