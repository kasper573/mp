import type {
  AnyEventRouterHandlerNode,
  AnyEventRouterNode,
  AnyEventNode,
  InferEventInput,
  EventRouterNode,
} from "./builder";
import { createInvocationProxy } from "@mp/invocation-proxy";

export function createEventRouterProxyInvoker<Node extends AnyEventNode>(
  invoke: EventRouterInvoker,
): EventRouterProxyInvoker<Node> {
  const proxy = createInvocationProxy((path) => (input) => {
    // oxlint-disable-next-line no-console
    console.log("sending", path.join("."));
    void invoke(path, input);
  });

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
