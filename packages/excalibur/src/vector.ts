import { Vector } from "excalibur";

export interface VectorLike {
  x: number;
  y: number;
}

export function floorVector({ x, y }: VectorLike): Vector {
  return new Vector(Math.floor(x), Math.floor(y));
}
