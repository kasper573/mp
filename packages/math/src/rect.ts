import type { MatrixData } from "./matrix";
import type { Vector, VectorLike } from "./vector";

export class Rect<T extends number> implements RectLike<T> {
  constructor(
    public readonly x: T,
    public readonly y: T,
    public readonly width: T,
    public readonly height: T,
  ) {
    Object.freeze(this);
  }

  contains(v: Vector<T>): boolean {
    return (
      v.x >= this.x &&
      v.x <= this.x + this.width &&
      v.y >= this.y &&
      v.y <= this.y + this.height
    );
  }

  /**
   * 1 = fully obscured by `other`
   * 0.5 = half of the area is obscured by `other`
   * 0 = no intersection at all
   */
  overlap(other: Rect<T>): number {
    if (
      this.width <= 0 ||
      this.height <= 0 ||
      other.width <= 0 ||
      other.height <= 0
    ) {
      return 0;
    }

    if (
      this.x + this.width < other.x ||
      this.x > other.x + other.width ||
      this.y + this.height < other.y ||
      this.y > other.y + other.height
    ) {
      return 0;
    }

    const xOverlap = Math.max(
      0,
      Math.min(this.x + this.width, other.x + other.width) -
        Math.max(this.x, other.x),
    );
    const yOverlap = Math.max(
      0,
      Math.min(this.y + this.height, other.y + other.height) -
        Math.max(this.y, other.y),
    );

    return (xOverlap * yOverlap) / (this.width * this.height);
  }

  offset(offset: Vector<T>): Rect<T> {
    return new Rect(
      (this.x + offset.x) as T,
      (this.y + offset.y) as T,
      this.width,
      this.height,
    );
  }

  scale<B extends number>(b: Vector<B>): Rect<B> {
    return new Rect<B>(
      (this.x * b.x) as B,
      (this.y * b.y) as B,
      (this.width * b.x) as B,
      (this.height * b.y) as B,
    );
  }

  divide<B extends number>(b: Vector<B>): Rect<B> {
    return new Rect<B>(
      (this.x / b.x) as B,
      (this.y / b.y) as B,
      (this.width / b.x) as B,
      (this.height / b.y) as B,
    );
  }

  apply([a, b, c, d, tx, ty]: MatrixData): Rect<T> {
    const { x, y, width, height } = this;

    // Transform all four corners
    const x0 = a * x + c * y + tx;
    const y0 = b * x + d * y + ty;

    const x1 = a * (x + width) + c * y + tx;
    const y1 = b * (x + width) + d * y + ty;

    const x2 = a * x + c * (y + height) + tx;
    const y2 = b * x + d * (y + height) + ty;

    const x3 = a * (x + width) + c * (y + height) + tx;
    const y3 = b * (x + width) + d * (y + height) + ty;

    // Compute axis-aligned bounding box of transformed points
    const newX = Math.min(x0, x1, x2, x3);
    const newY = Math.min(y0, y1, y2, y3);
    const newWidth = Math.max(x0, x1, x2, x3) - newX;
    const newHeight = Math.max(y0, y1, y2, y3) - newY;

    return new Rect(newX as T, newY as T, newWidth as T, newHeight as T);
  }

  static fromDiameter<T extends number>(
    center: Vector<T>,
    diameter: T,
  ): Rect<T> {
    return new Rect(
      (center.x - diameter / 2) as T,
      (center.y - diameter / 2) as T,
      diameter,
      diameter,
    );
  }

  static fromVectors<T extends number>(
    position: VectorLike<T>,
    size: VectorLike<T>,
  ): Rect<T> {
    return new Rect(position.x, position.y, size.x, size.y);
  }

  static from<T extends number>(like: RectLike<T>): Rect<T> {
    return new Rect(like.x, like.y, like.width, like.height);
  }
}

export interface RectLike<T extends number> {
  x: T;
  y: T;
  width: T;
  height: T;
}

export type RectComponents<T> = [x: T, y: T, width: T, height: T];
