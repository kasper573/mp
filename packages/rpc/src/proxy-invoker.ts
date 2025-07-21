import type {
  AnyRpcProcedureNode,
  AnyRpcRouterNode,
  AnyRpcNode,
  InferRpcContext,
  InferRpcInput,
  InferRpcOutput,
} from "./builder";
import { createInvocationProxy } from "@mp/invocation-proxy";
import { createRpcInvoker, type RpcCallId } from "./rpc-invoker";

export function createRpcProxyInvoker<Node extends AnyRpcNode>(
  call: RpcCaller,
): RpcProxyInvoker<Node> {
  const proxy = createInvocationProxy((path) => (input) => call(path, input));

  return proxy as RpcProxyInvoker<Node>;
}

export function createRpcProxyInvokerForNode<Node extends AnyRpcNode>(
  node: Node,
  context: InferRpcContext<Node>,
): RpcProxyInvoker<Node> {
  const invoke = createRpcInvoker(node);

  let idCounter = 0;
  const proxy = createInvocationProxy(
    (path) => (input) =>
      invoke([path, input, idCounter++ as RpcCallId], context),
  );

  return proxy as RpcProxyInvoker<Node>;
}

export type RpcCaller<Input = unknown, Output = unknown> = (
  path: string[],
  input: Input,
) => Promise<Output>;

export type RpcProxyInvoker<Node extends AnyRpcNode> =
  Node extends AnyRpcRouterNode
    ? RpcRouterInvoker<Node>
    : Node extends AnyRpcProcedureNode
      ? RpcProcedureInvoker<Node>
      : never;

export type RpcRouterInvoker<Router extends AnyRpcRouterNode> = {
  [K in keyof Router["routes"]]: RpcProxyInvoker<Router["routes"][K]>;
};

export interface RpcQueryOptions<Input, Output, MappedOutput> {
  input: Input;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
}

export type RpcProcedureInvoker<Node extends AnyRpcProcedureNode> = (
  input: InferRpcInput<Node["handler"]>,
) => Promise<InferRpcOutput<Node["handler"]>>;
