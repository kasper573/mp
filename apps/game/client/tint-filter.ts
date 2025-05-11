import { ColorMatrixFilter } from "pixi.js";

/**
 * Creates a ColorMatrixFilter that tints toward a given color.
 * @param color - 0xRRGGBB integer
 * @param strength - 0 (no effect) to 1 (full tint)
 */

export function createTintFilter(
  color: number,
  strength: number = 0.25,
): ColorMatrixFilter {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;

  const inv = 1 - strength;

  const matrix: ColorMatrixFilter["matrix"] = [
    inv,
    0,
    0,
    0,
    r * strength,
    0,
    inv,
    0,
    0,
    g * strength,
    0,
    0,
    inv,
    0,
    b * strength,
    0,
    0,
    0,
    1,
    0,
  ];

  const filter = new ColorMatrixFilter();
  filter.matrix = matrix;
  return filter;
}
