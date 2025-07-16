import type { Vector } from "@mp/math";
import type { Pixel, Tile } from "@mp/std";

/**
 * Position in pixel space using Vector
 */
export type Position = Vector<Pixel>;

/**
 * Size in pixel space using Vector
 */
export type Size = Vector<Pixel>;

/**
 * Position in tile space using Vector
 */
export type TilePosition = Vector<Tile>;

/**
 * Size in tile space using Vector
 */
export type TileSize = Vector<Tile>;

/**
 * Helper type for polygon/polyline coordinates
 */
export type CoordinatePath = readonly Position[];
