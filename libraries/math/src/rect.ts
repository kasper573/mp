import type { Vector } from "./vector";

export interface Rect<T extends number> {
  x: T;
  y: T;
  width: T;
  height: T;
}

export const rect_from_diameter = <T extends number>(
  center: Vector<T>,
  diameter: T,
): Rect<T> => ({
  x: (center.x - diameter / 2) as T,
  y: (center.y - diameter / 2) as T,
  width: diameter,
  height: diameter,
});

export function rect_hit_test<T extends number>(
  rect: Rect<T>,
  v: Vector<T>,
): boolean {
  const { x, y, width, height } = rect;
  return v.x >= x && v.x <= x + width && v.y >= y && v.y <= y + height;
}

export function rect_offset<T extends number>(
  rect: Rect<T>,
  offset: Vector<T>,
): Rect<T> {
  return {
    x: (rect.x + offset.x) as T,
    y: (rect.y + offset.y) as T,
    width: rect.width,
    height: rect.height,
  };
}

export const rect_scale = <A extends number, B extends number>(
  a: Rect<A>,
  b: Vector<B>,
): Rect<B> => ({
  x: (a.x * b.x) as B,
  y: (a.y * b.y) as B,
  width: (a.width * b.x) as B,
  height: (a.height * b.y) as B,
});
