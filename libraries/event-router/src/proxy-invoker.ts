import type {
  AnyHandlerNode,
  AnyRouterNode,
  AnyEventNode,
  InferEventInput,
  RouterNode,
} from "./builder";
import { createInvocationProxy } from "@mp/invocation-proxy";
import type { EventRouterMessage } from "./event-invoker";

export function createProxyEventInvoker<Node extends AnyEventNode>(
  invoke: (message: EventRouterMessage<unknown>) => void,
): ProxyEventInvoker<Node> {
  const proxy = createInvocationProxy(
    (path) => (input) => void invoke([path, input]),
  );

  return proxy as ProxyEventInvoker<Node>;
}

export type ProxyEventInvoker<Node extends AnyEventNode> =
  Node extends AnyRouterNode
    ? ProxyRecord<Node>
    : Node extends AnyHandlerNode
      ? ProxyNode<Node>
      : never;

export type MergeEventRouterNodes<
  A extends AnyRouterNode,
  B extends AnyRouterNode,
> = RouterNode<A["routes"] & B["routes"]>;

type ProxyRecord<Router extends AnyRouterNode> = {
  [K in keyof Router["routes"]]: ProxyEventInvoker<Router["routes"][K]>;
};

type ProxyNode<Node extends AnyHandlerNode> = (
  input: InferEventInput<Node["handler"]>,
) => void;
