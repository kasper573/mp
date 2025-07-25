import type {
  AnyEventRouterHandlerNode,
  AnyEventRouterNode,
  AnyEventNode,
  InferEventContext,
  InferEventInput,
  EventRouterNode,
} from "./builder";
import { createInvocationProxy } from "@mp/invocation-proxy";
import { createEventRouterReceiver } from "./event-receiver";

export function createEventRouterProxyInvoker<Node extends AnyEventNode>(
  invoke: EventRouterInvoker,
): EventRouterProxyInvoker<Node> {
  const proxy = createInvocationProxy(
    (path) => (input) => void invoke(path, input),
  );

  return proxy as EventRouterProxyInvoker<Node>;
}

export function createEventRouterProxyInvokerForNode<Node extends AnyEventNode>(
  node: Node,
  context: InferEventContext<Node>,
): EventRouterProxyInvoker<Node> {
  const invoke = createEventRouterReceiver(node);

  const proxy = createInvocationProxy(
    (path) => (input) => invoke([path, input], context),
  );

  return proxy as EventRouterProxyInvoker<Node>;
}

export type EventRouterInvoker<Input = unknown> = (
  path: string[],
  input: Input,
) => void;

export type EventRouterProxyInvoker<Node extends AnyEventNode> =
  Node extends AnyEventRouterNode
    ? EventRouterProxyInvokerRecord<Node>
    : Node extends AnyEventRouterHandlerNode
      ? EventRouterEventInvoker<Node>
      : never;

export type MergeEventRouterNodes<
  A extends AnyEventRouterNode,
  B extends AnyEventRouterNode,
> = EventRouterNode<A["routes"] & B["routes"]>;

export type EventRouterProxyInvokerRecord<Router extends AnyEventRouterNode> = {
  [K in keyof Router["routes"]]: EventRouterProxyInvoker<Router["routes"][K]>;
};

export interface EventRouterQueryOptions<Input> {
  input: Input;
}

export type EventRouterEventInvoker<Node extends AnyEventRouterHandlerNode> = (
  input: InferEventInput<Node["handler"]>,
) => void;
