import type { Vector } from "@mp/math";
import { vec } from "@mp/math";
import type { NodeId } from "ngraph.graph";

export function nodeIdFromVector({ x, y }: Vector): NodeId {
  return `${x}${separator}${y}`;
}

export function vectorFromNodeId(id: NodeId): Vector {
  const [x, y] = String(id).split("|").map(Number);
  return vec(x, y);
}

const separator = "|";
