import { assert } from "@mp/std";
import type {
  EventRouterMessage,
  EventRouterInvokerResult,
  EventRouterInvoker,
} from "./event-invoker";
import type { Logger } from "@mp/logger";

export interface QueuedEventInvokerOptions<Context> {
  invoke?: EventRouterInvoker<Context>;
  logger?: Logger;
}

export class QueuedEventInvoker<Context = void> {
  #queue: Array<[EventRouterMessage<unknown>, Context]> = [];
  #isInvokingEvent = false;

  constructor(private opt: QueuedEventInvokerOptions<Context>) {}

  addEvent = (message: EventRouterMessage<unknown>, context: Context) => {
    const path = message[0].join(".");
    this.opt.logger?.debug(`Queueing event: ${path}`);
    this.#queue.push([message, context]);
    void this.pollQueue();
  };

  private async pollQueue(): Promise<
    EventRouterInvokerResult<unknown> | undefined
  > {
    if (this.#isInvokingEvent) {
      return;
    }

    const next = this.#queue.shift();
    if (!next) {
      return;
    }

    this.#isInvokingEvent = true;
    const [message, context] = next;
    const path = message[0].join(".");
    this.opt.logger?.debug(`Invoking event: ${path}`);

    const invokeFn = assert(this.opt.invoke, "No invoke function provided");
    const result = await invokeFn(message, context);

    if (result.isErr()) {
      this.opt.logger?.error(result.error, `Error handling event "${path}"`);
    } else {
      this.opt.logger?.info(`Event: ${path}`);
    }

    this.#isInvokingEvent = false;

    void this.pollQueue();
  }
}
