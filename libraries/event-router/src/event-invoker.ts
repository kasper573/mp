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
      return err(
        new EventRouterInvokerError(path, new Error("path not found")),
      );
    }

    try {
      await node.handler({ ctx, input, mwc });
      return ok(void 0);
    } catch (error) {
      return err(new EventRouterInvokerError(path, error));
    }
  };
}

export function willRouterAcceptMessage<Context>(
  root: AnyEventNode<Context>,
  message: EventRouterMessage<unknown>,
) {
  return resolveEventNode(root, message[0]) !== undefined;
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

export class EventRouterInvokerError extends Error {
  constructor(path: string[], cause?: unknown) {
    super(`Error invoking event "${path.join(".")}"`, {
      cause,
    });
    this.name = "EventRouterInvokerError";
  }
}

export type EventRouterInvoker<Context = void> = (
  message: EventRouterMessage<unknown>,
  context: Context,
) => Promise<EventRouterInvokerResult>;

export type EventRouterInvokerResult = Result<void, EventRouterInvokerError>;

export type EventRouterMessage<Input> = [path: string[], input: Input];

// The first handler never has a middleware context,
// but we provide an empty object to make debugging easier,
// since many eventrouter handlers will try to destructure the mwc in the function signature,
// which can make breakpoints hard to set if it's undefined.
// Defaulting to an empty object slightly improves dx at no cost.
const mwc = Object.freeze({});
