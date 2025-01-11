import type { Vector } from "./vector";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const rect_fromDiameter = (center: Vector, diameter: number): Rect => ({
  x: center.x - diameter / 2,
  y: center.y - diameter / 2,
  width: diameter,
  height: diameter,
});

export const rect_intersectsPoint = (rect: Rect, p: Vector): boolean =>
  p.x >= rect.x &&
  p.x <= rect.x + rect.width &&
  p.y >= rect.y &&
  p.y <= rect.y + rect.height;
