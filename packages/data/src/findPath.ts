import type { Vector } from "@mp/math";
import { vec, vec_add, vec_distance } from "@mp/math";
import { snapTileVector } from "./TiledResource";
import { find_path } from "./dijkstra";

export function findPath(
  start: Vector,
  target: Vector,
  graph: DGraph,
): Vector[] | undefined {
  if (isFractionalVector(start)) {
    graph = addVectorToAdjacentInGraph(graph, start);
  }

  try {
    // Skip the first node in the result because it is the start node.
    // We are only interested in future nodes.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const res: DNode[] = find_path(
      graph,
      dNodeFromVector(start),
      dNodeFromVector(target),
    );

    const [_, ...remaining] = res.map(vectorFromDNode);
    return remaining;
  } catch {
    // Do nothing
  }
}

export function isVectorInGraph(graph: DGraph, v?: Vector): v is Vector {
  return v && graph[dNodeFromVector(v)] ? true : false;
}

export function dNodeFromVector({ x, y }: Vector): DNode {
  return `${x}${separator}${y}`;
}

export function vectorFromDNode(node: DNode): Vector {
  const [x, y] = node.split("|").map(Number);
  return vec(x, y);
}

export function addVectorToAdjacentInGraph(graph: DGraph, v: Vector): DGraph {
  const updatedGraph = { ...graph };
  const nodeAsVector = vec(v.x, v.y);
  const adjacent = adjacentVectors(v);
  updatedGraph[dNodeFromVector(v)] = Object.fromEntries(
    adjacent
      .filter((adjacent) => isVectorInGraph(graph, adjacent))
      .map((adjacent) => [
        dNodeFromVector(adjacent),
        vec_distance(nodeAsVector, adjacent),
      ]),
  );
  return updatedGraph;
}

function adjacentVectors(fractional: Vector): Vector[] {
  const from = snapTileVector(fractional);
  const xOffset = (fractional.x - 0.5) % 1 < 0.5 ? -1 : 1;
  const yOffset = (fractional.y - 0.5) % 1 < 0.5 ? -1 : 1;

  return [
    from,
    vec_add(from, vec(xOffset, 0)),
    vec_add(from, vec(0, yOffset)),
    vec_add(from, vec(xOffset, yOffset)),
  ];
}

function isFractionalVector(v: Vector): boolean {
  return v.x % 1 !== 0 || v.y % 1 !== 0;
}

export type DGraph<Node extends DNode = DNode> = {
  [nodeId in Node]?: {
    [neighborId in Node]?: number;
  };
};

export type DNode = `${number}${typeof separator}${number}`;

const separator = "|";
