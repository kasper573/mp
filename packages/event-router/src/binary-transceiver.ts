import { createEncoding } from "@mp/encoding";
import type {
  EventRouterMessageInvoker,
  EventRouterMessage,
  EventRouterMessageInvokerResult,
} from "./event-invoker";
import type { Logger } from "@mp/logger";

import { assert } from "@mp/std";

export interface BinaryEventTransceiverOptions<Context> {
  send?: (messageBuffer: ArrayBufferLike) => unknown;
  invoke?: EventRouterMessageInvoker<Context>;
  logger?: Logger;
}

export class BinaryEventTransceiver<Context = void> {
  // Claiming the range 43_000 - 43_999 for the binary event protocol
  #messageEncoding = createEncoding<EventRouterMessage<unknown>>(43_000);
  #messageQueue: Array<[EventRouterMessage<unknown>, Context]> = [];
  #isInvokingEvent = false;

  constructor(private opt: BinaryEventTransceiverOptions<Context>) {}

  send<Input>(message: EventRouterMessage<Input>) {
    const sendFn = assert(this.opt.send, "No send function provided");
    sendFn(this.#messageEncoding.encode(message));
  }

  handleMessage(data: ArrayBufferLike, context: Context) {
    const decodeResult = this.#messageEncoding.decode(data);
    if (decodeResult.isOk()) {
      const path = decodeResult.value[0].join(".");
      this.opt.logger?.debug(`Queueing event: ${path}`);
      this.#messageQueue.push([decodeResult.value, context]);
      void this.pollMessageQueue();
    }
    return decodeResult;
  }

  private async pollMessageQueue(): Promise<
    EventRouterMessageInvokerResult<unknown> | undefined
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
