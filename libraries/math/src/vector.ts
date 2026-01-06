import type { Branded } from "@mp/std";

export class Vector<T extends number> implements VectorLike<T> {
  constructor(
    public readonly x: T,
    public readonly y: T,
  ) {
    Object.freeze(this);
  }

  // Note on squared distance checking:
  // Use these functions in favor of calling .distance(b) and comparing with some amount.
  // These function avoids the square root operation, which saves on performance.

  squaredDistance(b: VectorLike<T>): T {
    return squaredDistance(this.x, this.y, b.x, b.y);
  }

  isWithinDistance(b: VectorLike<T>, distance: number): boolean {
    const sd = this.squaredDistance(b);
    return sd <= distance * distance;
  }

  isOutOfReach(b: VectorLike<T>, distance: number): boolean {
    const sd = this.squaredDistance(b);
    return sd > distance * distance;
  }

  distance(b: VectorLike<T>): T {
    return Math.sqrt(this.squaredDistance(b)) as T;
  }

  add(b: VectorLike<T>): Vector<T> {
    return new Vector<T>((this.x + b.x) as T, (this.y + b.y) as T);
  }

  scale<B extends number>(b: VectorLike<B>): Vector<B> {
    return new Vector<B>((this.x * b.x) as B, (this.y * b.y) as B);
  }

  divide<B extends number>(b: VectorLike<B>): Vector<B> {
    return new Vector<B>((this.x / b.x) as B, (this.y / b.y) as B);
  }

  equals(b: VectorLike<T>): boolean {
    return this.x === b.x && this.y === b.y;
  }

  round(): Vector<T> {
    return new Vector<T>(Math.round(this.x) as T, Math.round(this.y) as T);
  }

  angle(other: VectorLike<T>): number {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    return Math.atan2(dy, dx);
  }

  isFraction(precision: number): boolean {
    return (
      Math.abs(this.x - Math.round(this.x)) > precision ||
      Math.abs(this.y - Math.round(this.y)) > precision
    );
  }

  toString(): string {
    return `${this.x.toFixed(1)}, ${this.y.toFixed(1)}`;
  }

  static zero<T extends number>(): Vector<T> {
    return vecZeroConst as Vector<T>;
  }

  static from<T extends number>(obj: VectorLike<T>): Vector<T> {
    return new Vector<T>(obj.x, obj.y);
  }

  static key(x: number, y: number): VectorKey {
    return `${x}|${y}` as VectorKey;
  }

  static keyFrom(v: VectorLike<number>): VectorKey {
    return Vector.key(v.x, v.y);
  }
}

export function squaredDistance<T extends number>(
  ax: T,
  ay: T,
  bx: T,
  by: T,
): T {
  const dx = ax - bx;
  const dy = ay - by;
  return (dx * dx + dy * dy) as T;
}

/**
 * A unique key for a vector, useful for hashing.
 */
export type VectorKey = Branded<string, "VectorKey">;

const vecZeroConst = new Vector(0, 0);

export type Path<T extends number> = readonly Vector<T>[];

export function isPathEqual<P extends Path<number>>(a?: P, b?: P): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }

  return a.every((v1, i) => b[i].equals(v1));
}

/** @gqlType */
export interface VectorLike<T extends number> {
  /** @gqlField */
  x: T;
  /** @gqlField */
  y: T;
}

export type PathLike<T extends number> = readonly VectorLike<T>[];
