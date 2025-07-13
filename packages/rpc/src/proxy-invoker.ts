import type {
  AnyProcedureNode,
  AnyRouterNode,
  AnyRpcNode,
  InferContext,
  InferInput,
  InferOutput,
} from "./builder";
import { createInvocationProxy } from "./invocation-proxy";
import { createRpcInvoker, type RpcCallId } from "./rpc-invoker";

export function createRpcProxyInvoker<Node extends AnyRpcNode>(
  call: RpcCaller,
): RpcProxyInvoker<Node> {
  const proxy = createInvocationProxy((path) => (input) => call(path, input));

  return proxy as RpcProxyInvoker<Node>;
}

export function createRpcProxyInvokerForNode<Node extends AnyRpcNode>(
  node: Node,
  context: InferContext<Node>,
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

export type RpcProcedureInvoker<Node extends AnyProcedureNode> = (
  input: InferInput<Node["handler"]>,
) => Promise<InferOutput<Node["handler"]>>;
