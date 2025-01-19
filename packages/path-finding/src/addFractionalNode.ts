import { type Vector, vec, vec_add, vec_round } from "@mp/math";
import type { Graph } from "./types";

export function addFractionalNode(graph: Graph, fractional: Vector): void {
  graph.addNode(fractional);

  for (const adjacent of adjacentVectors(fractional)) {
    if (graph.hasNode(adjacent)) {
      graph.addLink(fractional, adjacent);
    }
  }
}

function* adjacentVectors(fractional: Vector): Generator<Vector> {
  const from = vec_round(fractional);
  const xOffset = (fractional.x - 0.5) % 1 < 0.5 ? -1 : 1;
  const yOffset = (fractional.y - 0.5) % 1 < 0.5 ? -1 : 1;

  yield from;
  yield vec_add(from, vec(xOffset, 0));
  yield vec_add(from, vec(0, yOffset));
  yield vec_add(from, vec(xOffset, yOffset));
}
