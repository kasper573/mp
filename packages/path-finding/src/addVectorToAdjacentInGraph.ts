import { type Vector, vec, vec_add, vec_distance, vec_round } from "@mp/math";
import type { Graph } from "./types";

export function addVectorToAdjacentInGraph(
  graph: Graph,
  vector: Vector,
): UndoFn {
  graph.addNode(vector);

  for (const adjacent of adjacentVectors(vector)) {
    if (graph.hasNode(adjacent)) {
      const weight = vec_distance(vector, adjacent);
      graph.addLink(vector, adjacent, weight);
    }
  }

  return function undo() {
    graph.removeNode(vector);
  };
}

export type UndoFn = () => void;

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
