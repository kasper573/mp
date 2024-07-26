import { ArraySchema } from "@colyseus/schema";
import type { CoordinateLike } from "./schema";
import { Coordinate } from "./schema";

export function findPath(
  a: CoordinateLike,
  b: CoordinateLike,
): ArraySchema<Coordinate> {
  return new ArraySchema<Coordinate>(new Coordinate(b.x, b.y));
}
