import { Vector } from "./vector";

export class Rect<T extends number> implements RectLike<T> {
  get x(): T {
    return this.position.x;
  }
  get y(): T {
    return this.position.y;
  }
  get width(): T {
    return this.size.x;
  }
  get height(): T {
    return this.size.y;
  }

  constructor(
    public readonly position: Vector<T>,
    public readonly size: Vector<T>,
  ) {}

  contains(v: Vector<T>): boolean {
    return (
      v.x >= this.x &&
      v.x <= this.x + this.width &&
      v.y >= this.y &&
      v.y <= this.y + this.height
    );
  }

  offset(offset: Vector<T>): Rect<T> {
    return new Rect(this.position.add(offset), this.size);
  }

  scale<B extends number>(b: Vector<B>): Rect<B> {
    return new Rect(this.position.scale(b), this.size.scale(b));
  }

  static fromDiameter<T extends number>(
    center: Vector<T>,
    diameter: T,
  ): Rect<T> {
    return Rect.fromComponents(
      (center.x - diameter / 2) as T,
      (center.y - diameter / 2) as T,
      diameter,
      diameter,
    );
  }

  static fromComponents<T extends number>(
    ...[x, y, width, height]: RectComponents<T>
  ): Rect<T> {
    return new Rect(new Vector(x, y), new Vector(width, height));
  }

  static from<T extends number>(like: RectLike<T>): Rect<T> {
    return Rect.fromComponents(like.x, like.y, like.width, like.height);
  }
}

export interface RectLike<T extends number> {
  x: T;
  y: T;
  width: T;
  height: T;
}

export type RectComponents<T> = [x: T, y: T, width: T, height: T];
