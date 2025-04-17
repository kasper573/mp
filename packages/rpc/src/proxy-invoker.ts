import type {
  AnyProcedureNode,
  AnyRouterNode,
  AnyRpcNode,
  ProcedureHandler,
} from "./builder";
import { createInvocationProxy } from "./invocation-proxy";
import type { AnyRpcTransceiver } from "./transceiver";

export function createRpcProxyInvoker<Node extends AnyRpcNode>(
  transceiver: AnyRpcTransceiver,
): RpcProxyInvoker<Node> {
  const proxy = createInvocationProxy(
    (path) => (input) => transceiver.call(path, input),
  );

  return proxy as RpcProxyInvoker<Node>;
}

export type RpcProxyInvoker<Node extends AnyRpcNode> =
  Node extends AnyRouterNode
    ? RpcRouterInvoker<Node>
    : Node extends AnyProcedureNode
      ? RpcProcedureInvoker<Node>
      : never;

export type RpcRouterInvoker<Router extends AnyRouterNode> = {
  [K in keyof Router["routes"]]: RpcProxyInvoker<Router["routes"][K]>;
};

export interface RpcQueryOptions<Input, Output, MappedOutput> {
  input: Input;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
}

export interface RpcProcedureInvoker<Node extends AnyProcedureNode> {
  (input: InferInput<Node["handler"]>): Promise<InferOutput<Node["handler"]>>;
}

export type InferInput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer I, infer O, infer C, infer MW> ? I : never;

export type InferOutput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer I, infer O, infer C, infer MW> ? O : never;
