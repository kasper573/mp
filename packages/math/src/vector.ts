// TODO immutable vectors
export class Vector implements VectorLike {
  constructor(
    public x: number,
    public y: number,
  ) {}

  distance = (v: Vector) => Math.hypot(this.x - v.x, this.y - v.y);

  add = (v: Vector) => new Vector(this.x + v.x, this.y + v.y);

  copy = () => new Vector(this.x, this.y);

  static from = (v: VectorLike) => new Vector(v.x, v.y);
}

export interface VectorLike {
  x: number;
  y: number;
}

export type Path = Vector[];
