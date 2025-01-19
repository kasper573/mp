import type { Vector } from "@mp/math";
import { vec } from "@mp/math";

export function nodeIdFromVector({ x, y }: Vector): NodeId {
  return `${x}${separator}${y}`;
}

export function vectorFromNodeId(id: NodeId): Vector {
  const [x, y] = id.split("|").map(Number);
  return vec(x, y);
}

export type NodeId = `${number}${typeof separator}${number}`;

const separator = "|";
