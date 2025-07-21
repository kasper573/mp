import type { Result } from "@mp/std";
import { err, ok } from "@mp/std";
import type { AnyEventNode } from "./builder";

export function createEventRouterReceiver<Context>(
  root: AnyEventNode<Context>,
): EventRouterMessageReceiver<Context> {
  return async function invokeEventRouter(message, ctx) {
    const [path, input] = message;
    const node = resolveEventRouterNode<Context>(root, path);
    if (!node || node.type === "router") {
      return err(new EventRouterReceiverError(message, "path not found"));
    }

    try {
      await node.handler({ ctx, input, mwc });
      return ok(void 0);
    } catch (error) {
      return err(new EventRouterReceiverError(message, error));
    }
  };
}

function resolveEventRouterNode<Context>(
  start: AnyEventNode,
  path: string[],
): AnyEventNode<Context> | undefined {
  let node: AnyEventNode | undefined = start;
  for (const key of path) {
    if (node.type === "router") {
      node = node.routes[key];
    }
  }
  return node;
}

export class EventRouterReceiverError<Input> extends Error {
  constructor(message: EventRouterMessage<Input>, cause?: unknown) {
    super(`error in event handler "${message[0].join(".")}"`, {
      cause,
    });
    this.name = "EventRouterInvokerError";
  }
}

export type EventRouterMessageReceiver<Context = void> = (
  message: EventRouterMessage<unknown>,
  context: Context,
) => Promise<EventRouterMessageReceiverResult<unknown>>;

export type EventRouterMessageReceiverResult<Input> = Result<
  void,
  EventRouterReceiverError<Input>
>;

export type EventRouterMessage<Input> = [path: string[], input: Input];

// The first handler never has a middleware context,
// but we provide an empty object to make debugging easier,
// since many eventrouter handlers will try to destructure the mwc in the function signature,
// which can make breakpoints hard to set if it's undefined.
// Defaulting to an empty object slightly improves dx at no cost.
const mwc = Object.freeze({});
