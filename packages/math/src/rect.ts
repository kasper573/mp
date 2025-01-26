import type { Vector } from "./vector";

export interface Rect<T extends number> {
  x: T;
  y: T;
  width: T;
  height: T;
}

export const rect_fromDiameter = <T extends number>(
  center: Vector<T>,
  diameter: T,
): Rect<T> => ({
  x: (center.x - diameter / 2) as T,
  y: (center.y - diameter / 2) as T,
  width: diameter,
  height: diameter,
});

export const rect_intersectsPoint = <T extends number>(
  rect: Rect<T>,
  p: Vector<T>,
): boolean =>
  p.x >= rect.x &&
  p.x <= rect.x + rect.width &&
  p.y >= rect.y &&
  p.y <= rect.y + rect.height;
