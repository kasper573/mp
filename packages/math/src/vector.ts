export const vec_distance = (a: Vector, b: Vector): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const vec_add = (a: Vector, b: Vector): Vector =>
  vec(a.x + b.x, a.y + b.y);

export const vec_scale = (v: Vector, s: number | Vector): Vector =>
  typeof s === "number" ? vec(v.x * s, v.y * s) : vec(v.x * s.x, v.y * s.y);

export const vec_copy = (v: Vector): Vector => vec(v.x, v.y);

export const vec_equals = (a: Vector, b: Vector): boolean =>
  a.x === b.x && a.y === b.y;

export const vec = (x: number, y: number): Vector => ({ x, y });

export function vec_round({ x, y }: Vector): Vector {
  return vec(Math.round(x), Math.round(y));
}

export function vec_has_fractions(v: Vector): boolean {
  return v.x % 1 !== 0 || v.y % 1 !== 0;
}

export const vec_zero: Vector = Object.freeze(vec(0, 0));

export interface Vector {
  x: number;
  y: number;
}

export type Path = Vector[];
