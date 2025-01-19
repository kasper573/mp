import type { Vector } from "@mp/math";

export type PathFinder = (
  start: Vector,
  target: Vector,
) => Vector[] | undefined;

export interface Graph {
  addNode(v: Vector): void;
  addLink(from: Vector, to: Vector, weight: number): void;
  hasNode(v: Vector): boolean;
  removeNode(v: Vector): void;
  getLinks(v: Vector): Vector[];
  createPathFinder: () => PathFinder;
}
