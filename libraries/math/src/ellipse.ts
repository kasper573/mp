import type { RectLike } from "./rect";
import type { VectorLike } from "./vector";

export function ellipseHitTest<T extends number>(
  ellipse: RectLike<T>,
  test: VectorLike<T>,
): boolean {
  const { x, y, width, height } = ellipse;
  const dx = x - test.x;
  const dy = y - test.y;
  const rx = width / 2;
  const ry = height / 2;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}
