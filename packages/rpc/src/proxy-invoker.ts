import type {
  AnyProcedureNode,
  AnyRouterNode,
  AnyRPCNode,
  ProcedureHandler,
} from "./builder";
import { createInvocationProxy } from "./invocation-proxy";
import type { AnyRPCTransmitter } from "./transmitter";

export function createRPCProxyInvoker<Node extends AnyRPCNode>(
  transmitter: AnyRPCTransmitter,
): RPCProxyInvoker<Node> {
  const proxy = createInvocationProxy(
    (path) => (input) => transmitter.call(path, input),
  );

  return proxy as RPCProxyInvoker<Node>;
}

export type RPCProxyInvoker<Node extends AnyRPCNode> =
  Node extends AnyRouterNode
    ? RPCRouterInvoker<Node>
    : Node extends AnyProcedureNode
      ? RPCProcedureInvoker<Node>
      : never;

export type RPCRouterInvoker<Router extends AnyRouterNode> = {
  [K in keyof Router["routes"]]: RPCProxyInvoker<Router["routes"][K]>;
};

export interface RPCQueryOptions<Input, Output, MappedOutput> {
  input: Input;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
}

export interface RPCProcedureInvoker<Node extends AnyProcedureNode> {
  (input: inferInput<Node["handler"]>): Promise<inferOutput<Node["handler"]>>;
}

export type inferInput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer I, infer O, infer C, infer MW> ? I : never;

export type inferOutput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer I, infer O, infer C, infer MW> ? O : never;
