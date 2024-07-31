import type { VectorLike } from "@mp/excalibur";
import { snapTileVector, Vector } from "@mp/excalibur";
import { find_path } from "./dijkstra";

export function findPath(
  start: VectorLike,
  target: VectorLike,
  graph: DGraph,
): Vector[] | undefined {
  if (isFractionalVector(start)) {
    graph = addVectorToAdjacentInGraph(graph, start);
  }

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

export function isVectorInGraph(
  graph: DGraph,
  v?: VectorLike,
): v is VectorLike {
  return v && graph[dNodeFromVector(v)] ? true : false;
}

export function dNodeFromVector({ x, y }: VectorLike): DNode {
  return `${x}${separator}${y}`;
}

export function vectorFromDNode(node: DNode): Vector {
  const [x, y] = node.split("|").map(Number);
  return new Vector(x, y);
}

export function addVectorToAdjacentInGraph(
  graph: DGraph,
  v: VectorLike,
): DGraph {
  const nodeAsVector = new Vector(v.x, v.y);
  const updatedGraph = { ...graph };
  const adjacent = adjacentVectors(v);
  const neighbors = Object.fromEntries(
    adjacent
      .filter((adjacent) => isVectorInGraph(graph, adjacent))
      .map((adjacent) => [
        dNodeFromVector(adjacent),
        adjacent.distance(nodeAsVector),
      ]),
  );

  updatedGraph[dNodeFromVector(v)] = neighbors;

  return updatedGraph;
}

function adjacentVectors(fractional: VectorLike): Vector[] {
  const from = snapTileVector(fractional);
  const xOffset = fractional.x % 1 < 0.5 ? -1 : 1;
  const yOffsetf = fractional.y % 1 < 0.5 ? -1 : 1;

  return [
    from,
    from.add(new Vector(xOffset, 0)),
    from.add(new Vector(0, yOffsetf)),
    from.add(new Vector(xOffset, yOffsetf)),
  ];
}

function isFractionalVector(v: VectorLike): boolean {
  return v.x % 1 !== 0 || v.y % 1 !== 0;
}

export type DGraph<Node extends DNode = DNode> = {
  [nodeId in Node]?: {
    [neighborId in Node]?: number;
  };
};

export type DNode = `${number}${typeof separator}${number}`;

const separator = "|" as const;
