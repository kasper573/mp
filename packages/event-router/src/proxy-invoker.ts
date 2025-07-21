import type {
  AnyEventNode,
  AnyRouterNode,
  AnyEventRouterNode,
  InferContext,
  InferInput,
} from "./builder";
import { createInvocationProxy } from "@mp/invocation-proxy";
import { createEventRouterInvoker } from "./event-invoker";

export function createEventRouterProxyInvoker<Node extends AnyEventRouterNode>(
  call: EventRouterCaller,
): EventRouterProxyInvoker<Node> {
  const proxy = createInvocationProxy((path) => (input) => call(path, input));

  return proxy as EventRouterProxyInvoker<Node>;
}

export function createEventRouterProxyInvokerForNode<
  Node extends AnyEventRouterNode,
>(node: Node, context: InferContext<Node>): EventRouterProxyInvoker<Node> {
  const invoke = createEventRouterInvoker(node);

  const proxy = createInvocationProxy(
    (path) => (input) => invoke([path, input], context),
  );

  return proxy as EventRouterProxyInvoker<Node>;
}

export type EventRouterCaller<Input = unknown> = (
  path: string[],
  input: Input,
) => void;

export type EventRouterProxyInvoker<Node extends AnyEventRouterNode> =
  Node extends AnyRouterNode
    ? EventRouterRouterInvoker<Node>
    : Node extends AnyEventNode
      ? EventRouterEventInvoker<Node>
      : never;

export type EventRouterRouterInvoker<Router extends AnyRouterNode> = {
  [K in keyof Router["routes"]]: EventRouterProxyInvoker<Router["routes"][K]>;
};

export interface EventRouterQueryOptions<Input> {
  input: Input;
}

export type EventRouterEventInvoker<Node extends AnyEventNode> = (
  input: InferInput<Node["handler"]>,
) => void;
