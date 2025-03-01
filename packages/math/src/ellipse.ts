import type { Rect } from "./rect";
import type { Vector } from "./vector";

export function ellipse_hit_test<T extends number>(
  ellipse: Rect<T>,
  test: Vector<T>,
): boolean {
  const { x, y, width, height } = ellipse;
  const dx = x - test.x;
  const dy = y - test.y;
  const rx = width / 2;
  const ry = height / 2;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}
