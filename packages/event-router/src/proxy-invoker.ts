import type {
  AnyEventRouterHandlerNode,
  AnyEventRouterNode,
  AnyEventNode,
  InferEventInput,
  EventRouterNode,
} from "./builder";
import { createInvocationProxy } from "@mp/invocation-proxy";
import type { EventRouterMessage } from "./event-invoker";

export function createEventRouterProxyInvoker<Node extends AnyEventNode>(
  invoke: (message: EventRouterMessage<unknown>) => void,
): EventRouterProxyInvoker<Node> {
  const proxy = createInvocationProxy(
    (path) => (input) => void invoke([path, input]),
  );

  return proxy as EventRouterProxyInvoker<Node>;
}

export type EventRouterProxyInvoker<Node extends AnyEventNode> =
  Node extends AnyEventRouterNode
    ? ProxyRecord<Node>
    : Node extends AnyEventRouterHandlerNode
      ? ProxyNode<Node>
      : never;

export type MergeEventRouterNodes<
  A extends AnyEventRouterNode,
  B extends AnyEventRouterNode,
> = EventRouterNode<A["routes"] & B["routes"]>;

type ProxyRecord<Router extends AnyEventRouterNode> = {
  [K in keyof Router["routes"]]: EventRouterProxyInvoker<Router["routes"][K]>;
};

type ProxyNode<Node extends AnyEventRouterHandlerNode> = (
  input: InferEventInput<Node["handler"]>,
) => void;
