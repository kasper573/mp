import { vec_distance, vec_has_fractions, type Vector } from "@mp/math";
import createGraph from "ngraph.graph";
import { aStar } from "ngraph.path";
import type { Graph } from "../types";
import { nodeIdFromVector } from "../nodeId";
import { addTemporaryNode } from "../addTemporaryNode";

export function createNGraph(): Graph {
  const n = createGraph<Vector, number>();

  return {
    addNode(vector) {
      n.addNode(nodeIdFromVector(vector), vector);
    },
    addLink(fromVector, toVector, weight) {
      n.addLink(
        nodeIdFromVector(fromVector),
        nodeIdFromVector(toVector),
        weight,
      );
    },
    getLinks(vector) {
      const links = n.getLinks(nodeIdFromVector(vector));
      if (!links) {
        return empty as Vector[];
      }
      return Array.from(
        links.values().map((link) => {
          const targetNode = n.getNode(link.toId);
          if (!targetNode) {
            throw new Error("Unexpected");
          }
          return targetNode.data;
        }),
      );
    },
    hasNode(vector) {
      return n.hasNode(nodeIdFromVector(vector)) !== undefined;
    },
    removeNode(vector) {
      n.removeNode(nodeIdFromVector(vector));
    },
    createPathFinder() {
      const pathFinder = aStar(n, {
        distance: (_1, _2, link) => link.data,
        heuristic: (from, to) => vec_distance(from.data, to.data),
      });
      return (start, end) => {
        const cleanupFns: Array<() => void> = [];
        const addTempStart = vec_has_fractions(start) && !this.hasNode(start);
        const addTempEnd = vec_has_fractions(end) && !this.hasNode(end);

        if (addTempStart) {
          cleanupFns.push(addTemporaryNode(this, start));
        }
        if (addTempEnd) {
          cleanupFns.push(addTemporaryNode(this, end));
        }

        const path = pathFinder
          .find(nodeIdFromVector(start), nodeIdFromVector(end))
          .map((node) => node.data)
          .reverse();

        if (addTempStart) {
          path.shift();
        }

        if (addTempEnd) {
          path.unshift();
        }

        for (const fn of cleanupFns) {
          fn();
        }

        return path;
      };
    },
  };
}

const empty = Object.freeze([] as unknown[]);
