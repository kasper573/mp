import type { CoordinateLike } from "@mp/server";
import { Vector } from "excalibur";

export function coordsToVec({ x, y }: CoordinateLike): Vector {
  return new Vector(x, y);
}

export function vecToCoords({ x, y }: Vector): CoordinateLike {
  return { x, y } as CoordinateLike;
}
