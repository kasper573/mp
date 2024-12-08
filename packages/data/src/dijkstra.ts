import { default as dijkstra } from "dijkstrajs";

export const find_path = dijkstra.find_path as typeof findPathFn;

declare function findPathFn<Node extends string>(
  graph: DijkstraGraph<Node>,
  start: string,
  end: string,
): Node[];

export type DijkstraGraph<Node extends string> = {
  [nodeId in Node]?: {
    [neighborId in Node]?: number;
  };
};
