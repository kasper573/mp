import type { VectorLike } from "@mp/excalibur";
import { Vector } from "@mp/excalibur";
import { find_path } from "./dijkstra";

export function findPath(
  start: VectorLike,
  target: VectorLike,
  graph: DGraph,
): Vector[] | undefined {
  try {
    // Skip the first node in the result because it is the start node.
    // We are only interested in future nodes.
    const [_, ...remaining] = find_path(
      graph,
      dNodeFromVector(start),
      dNodeFromVector(target),
    ).map(vectorFromDNode);

    return remaining;
  } catch {
    // Do nothing
  }
}

export function isInGraph(graph: DGraph, v?: VectorLike): v is VectorLike {
  return v && graph[dNodeFromVector(v)] ? true : false;
}

export function dNodeFromVector({ x, y }: VectorLike): DNode {
  return `${x}${separator}${y}`;
}

export function vectorFromDNode(node: DNode): Vector {
  const [x, y] = node.split("|").map(Number);
  return new Vector(x, y);
}

/**
 * A directed graph
 */
export type DGraph<Node extends DNode = DNode> = {
  [nodeId in Node]?: {
    [neighborId in Node]?: number;
  };
};

/**
 * A node in a directed graph
 */
export type DNode = `${number}${typeof separator}${number}`;

const separator = "|" as const;
