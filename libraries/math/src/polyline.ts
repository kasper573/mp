import type { Vector } from "./vector";

export function polyline_hit_test<T extends number>(
  obj: unknown,
  test: Vector<T>,
): boolean {
  return false;
}
