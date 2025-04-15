import type {
  AnyProcedureNode,
  AnyRouterNode,
  AnyRPCNode,
  ProcedureHandler,
} from "./builder";

export function createRPCInvoker<Node extends AnyRPCNode>(): RPCInvoker<Node> {
  throw new Error("Not implemented");
}

export type RPCInvoker<Node extends AnyRPCNode> = Node extends AnyRouterNode
  ? RPCRouterInvoker<Node>
  : Node extends AnyProcedureNode
    ? RPCProcedureInvoker<Node>
    : never;

export type RPCRouterInvoker<Router extends AnyRouterNode> = {
  [K in keyof Router["routes"]]: RPCInvoker<Router["routes"][K]>;
};

export interface RPCQueryOptions<Input, Output, MappedOutput> {
  input: Input;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
}

export interface RPCProcedureInvoker<Node extends AnyProcedureNode> {
  (input: inferInput<Node["handler"]>): Promise<inferOutput<Node["handler"]>>;
}

export type inferInput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer C, infer I, infer O, infer MW> ? I : never;

export type inferOutput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer C, infer I, infer O, infer MW> ? O : never;
