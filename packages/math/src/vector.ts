export class Vector<T extends number> implements VectorLike<T> {
  constructor(
    public readonly x: T,
    public readonly y: T,
  ) {
    Object.freeze(this);
  }

  distance(b: Vector<T>): T {
    return Math.hypot(this.x - b.x, this.y - b.y) as T;
  }

  add(b: Vector<T>): Vector<T> {
    return new Vector<T>((this.x + b.x) as T, (this.y + b.y) as T);
  }

  scale<B extends number>(b: Vector<B>): Vector<B> {
    return new Vector<B>((this.x * b.x) as B, (this.y * b.y) as B);
  }

  equals(b: Vector<T>): boolean {
    return this.x === b.x && this.y === b.y;
  }

  round(): Vector<T> {
    return new Vector<T>(Math.round(this.x) as T, Math.round(this.y) as T);
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
}

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

export function pathCopy<P extends Path<number> | undefined>(path: P): P {
  return path ? (Object.freeze([...path]) as P) : (undefined as P);
}

export interface VectorLike<T extends number> {
  x: T;
  y: T;
}
