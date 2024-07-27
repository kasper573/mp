import type { VectorLike } from "@mp/excalibur";
import { Vector } from "@mp/excalibur";
import { find_path } from "./dijkstra";

export function findPath(
  start: VectorLike,
  target: VectorLike,
  graph: PathGraph,
): Vector[] | undefined {
  try {
    return find_path(graph, createNodeId(start), createNodeId(target)).map(
      parseNodeId,
    );
  } catch {
    // Do nothing
  }
}

export function createNodeId({ x, y }: VectorLike): PathGraphNodeId {
  return `${x}${separator}${y}`;
}

export function parseNodeId(nodeId: PathGraphNodeId): Vector {
  const [x, y] = nodeId.split("|").map(Number);
  return new Vector(x, y);
}

export type PathGraph = DijkstraGraph<PathGraphNodeId>;
export type PathGraphNodeId = `${number}${typeof separator}${number}`;
const separator = "|" as const;

type DijkstraGraph<NodeId extends string = string> = {
  [nodeId in NodeId]?: {
    [neighborId in NodeId]?: number;
  };
};
