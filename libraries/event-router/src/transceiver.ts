import { createEncoding } from "@mp/encoding";
import type {
  EventRouterInvoker,
  EventRouterMessage,
  EventRouterInvokerResult,
} from "./event-invoker";
import type { Logger } from "@mp/logger";

import { assert } from "@mp/std";

export interface EventTransceiverOptions<Context> {
  send?: (messageBuffer: ArrayBufferLike) => unknown;
  invoke?: EventRouterInvoker<Context>;
  logger?: Logger;
}

export class EventTransceiver<Context = void> {
  // Claiming the range 43_000 - 43_999 for the binary event protocol
  static readonly messageEncoding =
    createEncoding<EventRouterMessage<unknown>>(43_000);
  #messageQueue: Array<[EventRouterMessage<unknown>, Context]> = [];
  #isInvokingEvent = false;

  constructor(private opt: EventTransceiverOptions<Context>) {}

  send = <Input>(message: EventRouterMessage<Input>) => {
    const sendFn = assert(this.opt.send, "No send function provided");
    sendFn(EventTransceiver.messageEncoding.encode(message));
  };

  handleMessage = (data: ArrayBufferLike, context: Context) => {
    const decodeResult = EventTransceiver.messageEncoding.decode(data);
    if (decodeResult.isOk()) {
      const path = decodeResult.value[0].join(".");
      this.opt.logger?.debug(`Queueing event: ${path}`);
      this.#messageQueue.push([decodeResult.value, context]);
      void this.pollMessageQueue();
    }
    return decodeResult;
  };

  private async pollMessageQueue(): Promise<
    EventRouterInvokerResult<unknown> | undefined
  > {
    if (this.#isInvokingEvent) {
      return;
    }

    const next = this.#messageQueue.shift();
    if (!next) {
      return;
    }

    this.#isInvokingEvent = true;
    const [message, context] = next;
    const path = message[0].join(".");
    this.opt.logger?.debug(`Invoking event: ${path}`);

    const receiveFn = assert(this.opt.invoke, "No receive function provided");
    const result = await receiveFn(message, context);

    if (result.isErr()) {
      this.opt.logger?.error(result.error, `Error handling event "${path}"`);
    } else {
      this.opt.logger?.info(`Event: ${path}`);
    }

    this.#isInvokingEvent = false;

    void this.pollMessageQueue();
  }
}
