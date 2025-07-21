import type { Branded, Result } from "@mp/std";
import { err, ok } from "@mp/std";
import type { AnyEventRouterNode } from "./builder";

export function createEventRouterInvoker<Context>(
  root: AnyEventRouterNode<Context>,
): EventRouterInvoker<Context> {
  return async function invokeEventRouter(call, ctx) {
    const [path, input] = call;
    const node = resolveEventRouterNode<Context>(root, path);
    if (!node || node.type === "router") {
      return err(new EventRouterInvokerError(call, "path not found"));
    }

    try {
      await node.handler({ ctx, input, mwc });
      return ok(void 0);
    } catch (error) {
      return err(new EventRouterInvokerError(call, error));
    }
  };
}

function resolveEventRouterNode<Context>(
  start: AnyEventRouterNode,
  path: string[],
): AnyEventRouterNode<Context> | undefined {
  let node: AnyEventRouterNode | undefined = start;
  for (const key of path) {
    if (node.type === "router") {
      node = node.routes[key];
    }
  }
  return node;
}

export class EventRouterInvokerError<Input> extends Error {
  constructor(call: EventRouterCall<Input>, cause?: unknown) {
    super(`error in event handler "${call[0].join(".")}"`, {
      cause,
    });
    this.name = "EventRouterInvokerError";
  }
}

export type EventRouterInvoker<Context = void> = (
  call: EventRouterCall<unknown>,
  context: Context,
) => Promise<EventRouterInvokerResult<unknown>>;

export type EventRouterInvokerResult<Input> = Result<
  void,
  EventRouterInvokerError<Input>
>;

export type EventRouterCallId = Branded<number, "EventRouterCallId">;

export type EventRouterCall<Input> = [path: string[], input: Input];

// The first handler never has a middleware context,
// but we provide an empty object to make debugging easier,
// since many eventrouter handlers will try to destructure the mwc in the function signature,
// which can make breakpoints hard to set if it's undefined.
// Defaulting to an empty object slightly improves dx at no cost.
const mwc = Object.freeze({});
