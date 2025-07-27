import type { Result, ResultAsync } from "@mp/std";
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

/**
 * A result that must pass for the event to be invoked.
 * Can be used for ie. rate limiting.
 *
 * (This needs to be part of event processing since rate limiting is often an async operation,
 * so it cannot be done before adding the events, since that would impact event ordering.)
 */
type EventCondition = () =>
  | Result<unknown, unknown>
  | ResultAsync<unknown, unknown>;

/**
 * Allows you to add events to a queue and process them one by one in sequence.
 */
export class QueuedEventInvoker<Context = void> {
  #queue: Array<
    [EventRouterMessage<unknown>, Context, EventCondition | undefined]
  > = [];
  #isProcessingEvent = false;

  constructor(private opt: QueuedEventInvokerOptions<Context>) {}

  addEvent = (
    message: EventRouterMessage<unknown>,
    context: Context,
    condition?: EventCondition,
  ) => {
    const path = message[0].join(".");
    this.opt.logger?.debug(`Queueing event: ${path}`);
    this.#queue.push([message, context, condition]);
    void this.pollQueue();
  };

  private async pollQueue(): Promise<
    EventRouterInvokerResult<unknown> | undefined
  > {
    if (this.#isProcessingEvent) {
      return;
    }

    const next = this.#queue.shift();
    if (!next) {
      return;
    }

    this.#isProcessingEvent = true;
    const [message, context, test] = next;

    const testResult = await test?.();
    if (testResult?.isErr()) {
      this.opt.logger?.error(testResult.error, `Skipped event`);
    } else {
      const path = message[0].join(".");
      this.opt.logger?.debug(`Invoking event: ${path}`);

      const invokeFn = assert(this.opt.invoke, "No invoke function provided");
      const result = await invokeFn(message, context);

      if (result.isErr()) {
        this.opt.logger?.error(result.error, `Error handling event "${path}"`);
      } else {
        this.opt.logger?.info(`Event: ${path}`);
      }
    }

    this.#isProcessingEvent = false;

    void this.pollQueue();
  }
}
