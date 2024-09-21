export class Vector implements VectorLike {
  constructor(
    public x: number,
    public y: number,
  ) {}

  distance = (v: Vector) => Math.hypot(this.x - v.x, this.y - v.y);

  add = (v: Vector) => new Vector(this.x + v.x, this.y + v.y);

  scale = (s: number | Vector) =>
    typeof s === "number"
      ? new Vector(this.x * s, this.y * s)
      : new Vector(this.x * s.x, this.y * s.y);

  copy = () => new Vector(this.x, this.y);

  equals = (v: Vector) => this.x === v.x && this.y === v.y;

  static from = (v: VectorLike) => new Vector(v.x, v.y);
  static zero = new Vector(0, 0);
}

export interface VectorLike {
  x: number;
  y: number;
}

export type Path = Vector[];
