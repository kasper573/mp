// @ts-expect-error No types exist
import dijkstrajs from "dijkstrajs";
import { vec_has_fractions, type Vector } from "@mp/math";
import type { NodeId } from "ngraph.graph";
import type { Graph } from "../types";
import { nodeIdFromVector, vectorFromNodeId } from "../nodeId";
import { addTemporaryNode } from "../addTemporaryNode";

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
export const find_path = dijkstrajs.find_path;

// For some reason typescript refuses to compile this file in vite even if I define
// the proper types as a declaration file, so we have to use ts-nocheck.

export function createDijkstraGraph(): Graph {
  const data: DijkstraData = {};
  return {
    addNode(vector) {
      data[nodeIdFromVector(vector)] = {};
    },
    addLink(fromVector, toVector, weight) {
      data[nodeIdFromVector(fromVector)][nodeIdFromVector(toVector)] = weight;
    },
    getLinks(vector) {
      const node = data[nodeIdFromVector(vector)];
      if (!node) {
        return empty as Vector[];
      }
      return Object.keys(node).map(vectorFromNodeId);
    },
    hasNode(vector) {
      return nodeIdFromVector(vector) in data;
    },
    removeNode(vector) {
      delete data[nodeIdFromVector(vector)];
    },
    createPathFinder() {
      return (start, target) => {
        let cleanup;
        if (vec_has_fractions(start)) {
          cleanup = addTemporaryNode(this, start);
        }

        try {
          // Skip the first node in the result because it is the start node.
          // We are only interested in future nodes.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
          const res: NodeId[] = find_path(
            data,
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
    },
  };
}

type DijkstraData = Record<NodeId, DijkstraNode>;
type DijkstraNode = Record<NodeId, number>;

const empty = Object.freeze([] as unknown[]);
