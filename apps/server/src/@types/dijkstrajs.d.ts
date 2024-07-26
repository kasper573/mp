declare module "dijkstrajs" {
  export type Weight = number;

  export type DijkstraGraph<NodeId extends string = string> = {
    [nodeId in NodeId]?: {
      [neighborId in NodeId]?: Weight;
    };
  };

  function find_path<NodeId extends string>(
    graph: DijkstraGraph<NodeId>,
    start: NoInfer<NodeId>,
    end: NoInfer<NodeId>,
  ): NoInfer<NodeId>[];

  export default { find_path };
}
