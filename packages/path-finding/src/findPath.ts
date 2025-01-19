import type { Vector } from "@mp/math";
import { vec, vec_add, vec_distance, vec_round } from "@mp/math";
import { find_path } from "./dijkstra";

export function createPathFinder(graph: Graph): PathFinder {
  return (start, target) => findPath(start, target, graph);
}

export function createGraph(): Graph {
  const djsGraph: DijstraJsGraph = {};
  return {
    addNode(id) {
      djsGraph[id] = {};
    },
    addLink(from, to, data) {
      djsGraph[from][to] = data.weight;
    },
    getLinks(id) {
      const node = djsGraph[id];
      return node ? (Object.keys(node) as NodeId[]) : [];
    },
    hasNode(id) {
      return id in djsGraph;
    },
    removeNode(id) {
      delete djsGraph[id];
    },
    djsGraph,
  };
}

export type PathFinder = (
  start: Vector,
  target: Vector,
) => Vector[] | undefined;

function findPath(
  start: Vector,
  target: Vector,
  graph: Graph,
): Vector[] | undefined {
  let cleanup;
  if (isFractionalVector(start)) {
    cleanup = addVectorToAdjacentInGraph(graph, start);
  }

  try {
    // Skip the first node in the result because it is the start node.
    // We are only interested in future nodes.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const res: NodeId[] = find_path(
      graph.djsGraph,
      nodeIdFromVector(start),
      nodeIdFromVector(target),
    );

    const [_, ...remaining] = res.map(vectorFromNodeId);
    return remaining;
  } catch {
    // Do nothing
  } finally {
    cleanup?.();
  }
}

export function isVectorInGraph(graph: Graph, v?: Vector): v is Vector {
  return v ? graph.hasNode(nodeIdFromVector(v)) : false;
}

export function nodeIdFromVector({ x, y }: Vector): NodeId {
  return `${x}${separator}${y}`;
}

export function vectorFromNodeId(id: NodeId): Vector {
  const [x, y] = id.split("|").map(Number);
  return vec(x, y);
}

export function addVectorToAdjacentInGraph(
  graph: Graph,
  v: Vector,
): () => void {
  const nodeAsVector = vec(v.x, v.y);
  const newNodeId = nodeIdFromVector(v);

  graph.addNode(newNodeId, { vector: v });

  for (const adjacent of adjacentVectors(v)) {
    if (isVectorInGraph(graph, adjacent)) {
      const weight = vec_distance(nodeAsVector, adjacent);
      const adjacentId = nodeIdFromVector(adjacent);
      graph.addLink(newNodeId, adjacentId, { weight });
    }
  }

  return function undo() {
    graph.removeNode(newNodeId);
  };
}

function adjacentVectors(fractional: Vector): Vector[] {
  const from = vec_round(fractional);
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

export interface Graph {
  djsGraph: DijstraJsGraph;
  addNode(id: NodeId, data: NodeData): void;
  addLink(from: NodeId, to: NodeId, data: LinkData): void;
  hasNode(id: NodeId): boolean;
  removeNode(id: NodeId): void;
  getLinks(id: NodeId): NodeId[];
}

type DijstraJsGraph = Record<NodeId, DijstraJsNode>;
type DijstraJsNode = Record<NodeId, number>;

export interface NodeData {
  vector: Vector;
}

export interface LinkData {
  weight: number;
}

export type NodeId = `${number}${typeof separator}${number}`;

const separator = "|";
