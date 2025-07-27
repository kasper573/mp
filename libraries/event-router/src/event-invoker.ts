import type { Result } from "@mp/std";
import { err, ok } from "@mp/std";
import type { AnyEventNode } from "./builder";

export function createEventInvoker<Context>(
  root: AnyEventNode<Context>,
): EventRouterInvoker<Context> {
  return async function invokeEventRouter(message, ctx) {
    const [path, input] = message;
    const node = resolveEventNode<Context>(root, path);
    if (!node || node.type === "router") {
      return err(new EventRouterInvokerError(message, "path not found"));
    }

    try {
      await node.handler({ ctx, input, mwc });
      return ok(void 0);
    } catch (error) {
      return err(new EventRouterInvokerError(message, error));
    }
  };
}

function resolveEventNode<Context>(
  start: AnyEventNode,
  path: string[],
): AnyEventNode<Context> | undefined {
  let node = start as AnyEventNode | undefined;
  for (const key of path) {
    if (node?.type === "router") {
      node = node.routes[key];
    }
  }
  return node;
}

export class EventRouterInvokerError<Input> extends Error {
  constructor(message: EventRouterMessage<Input>, cause?: unknown) {
    super(`error in event handler "${message[0].join(".")}"`, {
      cause,
    });
    this.name = "EventRouterInvokerError";
  }
}

export type EventRouterInvoker<Context = void> = (
  message: EventRouterMessage<unknown>,
  context: Context,
) => Promise<EventRouterInvokerResult<unknown>>;

export type EventRouterInvokerResult<Input> = Result<
  void,
  EventRouterInvokerError<Input>
>;

export type EventRouterMessage<Input> = [path: string[], input: Input];

// The first handler never has a middleware context,
// but we provide an empty object to make debugging easier,
// since many eventrouter handlers will try to destructure the mwc in the function signature,
// which can make breakpoints hard to set if it's undefined.
// Defaulting to an empty object slightly improves dx at no cost.
const mwc = Object.freeze({});
