// @ts-expect-error No types exist
import dijkstrajs from "dijkstrajs";
import type { Vector } from "@mp/math";
import type { Graph, PathFinder } from "../types";
import type { NodeId } from "../nodeId";
import { nodeIdFromVector, vectorFromNodeId } from "../nodeId";
import { addTemporaryNode } from "../addTemporaryNode";

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
export const find_path = dijkstrajs.find_path;

// For some reason typescript refuses to compile this file in vite even if I define
// the proper types as a declaration file, so we have to use ts-nocheck.

export function createDijkstraGraph(): DijkstraGraph {
  const data: DijkstraData = {};
  return {
    data,
    addNode(vector) {
      data[nodeIdFromVector(vector)] = {};
    },
    addLink(fromVector, toVector, weight) {
      data[nodeIdFromVector(fromVector)][nodeIdFromVector(toVector)] = weight;
    },
    getLinks(vector) {
      const node = data[nodeIdFromVector(vector)];
      const linkedNodeIds: NodeId[] = node
        ? (Object.keys(node) as NodeId[])
        : [];
      return linkedNodeIds.map(vectorFromNodeId);
    },
    hasNode(vector) {
      return nodeIdFromVector(vector) in data;
    },
    removeNode(vector) {
      delete data[nodeIdFromVector(vector)];
    },
  };
}

export function createDijkstraPathFinder(graph: DijkstraGraph): PathFinder {
  return (start, target) => {
    let cleanup;
    if (isFractionalVector(start)) {
      cleanup = addTemporaryNode(graph, start);
    }

    try {
      // Skip the first node in the result because it is the start node.
      // We are only interested in future nodes.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const res: NodeId[] = find_path(
        graph.data,
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
  };
}

function isFractionalVector(v: Vector): boolean {
  return v.x % 1 !== 0 || v.y % 1 !== 0;
}

export interface DijkstraGraph extends Graph {
  data: DijkstraData;
}

type DijkstraData = Record<NodeId, DijkstraNode>;
type DijkstraNode = Record<NodeId, number>;
