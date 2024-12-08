declare module "dijkstrajs" {
  export function find_path<Node extends string>(
    graph: DijkstraGraph<Node>,
    start: string,
    end: string
  ): Node[];

  export type DijkstraGraph<Node extends string> = {
    [nodeId in Node]?: {
      [neighborId in Node]?: number;
    };
  };
}
