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

export const vec_equals = <T extends number>(
  a: Vector<T>,
  b: Vector<T>,
): boolean => a.x === b.x && a.y === b.y;

export const vec = <const T extends number>(x: T, y: T): Vector<T> =>
  Object.freeze({
    x,
    y,
  });

export function vec_round<T extends number>({ x, y }: Vector<T>): Vector<T> {
  return vec<T>(Math.round(x) as T, Math.round(y) as T);
}

export function path_copy<P extends Path<number> | undefined>(path: P): P {
  return path ? (Object.freeze([...path]) as P) : (undefined as P);
}

export interface Vector<T extends number> {
  readonly x: T;
  readonly y: T;
}

export type Path<T extends number> = readonly Vector<T>[];

export function vec_zero<T extends number>(): Vector<T> {
  return vec_zero_const as Vector<T>;
}

const vec_zero_const = vec(0, 0);
