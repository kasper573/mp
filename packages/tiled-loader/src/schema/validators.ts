import { Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";
import { z } from "zod";
import type {
  Position,
  Size,
  TilePosition,
  TileSize,
  CoordinatePath,
} from "./vector-types";

/**
 * Validates and transforms {x, y} to Vector<Pixel>
 */
export const positionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .transform((data): Position => new Vector(data.x as Pixel, data.y as Pixel));

/**
 * Validates and transforms {width, height} to Vector<Pixel>
 */
export const sizeSchema = z
  .object({
    width: z.number(),
    height: z.number(),
  })
  .transform(
    (data): Size => new Vector(data.width as Pixel, data.height as Pixel),
  );

/**
 * Validates and transforms {x, y} to Vector<Tile>
 */
export const tilePositionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .transform(
    (data): TilePosition => new Vector(data.x as Tile, data.y as Tile),
  );

/**
 * Validates and transforms {width, height} to Vector<Tile>
 */
export const tileSizeSchema = z
  .object({
    width: z.number(),
    height: z.number(),
  })
  .transform(
    (data): TileSize => new Vector(data.width as Tile, data.height as Tile),
  );

/**
 * Validates and transforms array of {x, y} coordinates to Vector<Pixel>[]
 */
export const coordinatePathSchema = z
  .array(
    z
      .object({
        x: z.number(),
        y: z.number(),
      })
      .transform(
        (data): Position => new Vector(data.x as Pixel, data.y as Pixel),
      ),
  )
  .transform((data): CoordinatePath => data);

/**
 * Helper to validate object with position and size properties
 */
export const positionAndSizeSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .transform((data) => ({
    position: new Vector(data.x as Pixel, data.y as Pixel) as Position,
    size: new Vector(data.width as Pixel, data.height as Pixel) as Size,
  }));

/**
 * Helper to validate object with just position properties
 */
export const positionOnlySchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .transform((data) => ({
    position: new Vector(data.x as Pixel, data.y as Pixel) as Position,
  }));
