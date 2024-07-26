import { ArraySchema } from "@colyseus/schema";
import type { DijkstraGraph } from "dijkstrajs";
import dijkstra from "dijkstrajs";
import type { VectorLike } from "@mp/excalibur";
import { Coordinate } from "./schema";

export function findPath(
  start: VectorLike,
  target: VectorLike,
  graph: PathGraph,
): ArraySchema<Coordinate> | undefined {
  let path: PathGraphNodeId[];
  try {
    path = dijkstra.find_path(graph, createNodeId(start), createNodeId(target));
  } catch {
    return;
  }

  return new ArraySchema<Coordinate>(
    ...path.map((id) => {
      const { x, y } = parseNodeId(id);
      return new Coordinate(x, y);
    }),
  );
}

export function createNodeId({ x, y }: VectorLike): PathGraphNodeId {
  return `${x}${separator}${y}`;
}

function parseNodeId(nodeId: PathGraphNodeId): VectorLike {
  const [x, y] = nodeId.split("|").map(Number);
  return { x, y } as VectorLike;
}

export type PathGraph = DijkstraGraph<PathGraphNodeId>;
export type PathGraphNodeId = `${number}${typeof separator}${number}`;
const separator = "|" as const;
