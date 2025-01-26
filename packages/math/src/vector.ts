export const vec_distance = <T extends number>(a: Vector<T>, b: Vector<T>): T =>
  Math.hypot(a.x - b.x, a.y - b.y) as T;

export const vec_add = <T extends number>(
  a: Vector<T>,
  b: Vector<T>,
): Vector<T> => vec<T>((a.x + b.x) as T, (a.y + b.y) as T);

export const vec_scale = <A extends number, B extends number>(
  a: Vector<A>,
  b: Vector<B>,
): Vector<B> => vec<B>((a.x * b.x) as B, (a.y * b.y) as B);

export const vec_copy = <T extends number>(v: Vector<T>): Vector<T> =>
  vec(v.x, v.y);

export const vec_equals = <T extends number>(
  a: Vector<T>,
  b: Vector<T>,
): boolean => a.x === b.x && a.y === b.y;

export const vec = <const T extends number>(x: T, y: T): Vector<T> => ({
  x,
  y,
});

export function vec_round<T extends number>({ x, y }: Vector<T>): Vector<T> {
  return vec<T>(Math.round(x) as T, Math.round(y) as T);
}

export interface Vector<T extends number> {
  x: T;
  y: T;
}

export type Path<T extends number> = Vector<T>[];
