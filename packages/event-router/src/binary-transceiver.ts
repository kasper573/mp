import { createEncoding } from "@mp/encoding";
import type {
  EventRouterMessageReceiver,
  EventRouterMessage,
  EventRouterMessageReceiverResult,
} from "./event-receiver";

export interface BinaryEventTransceiverOptions<Context> {
  send?: (messageBuffer: ArrayBufferLike) => unknown;
  receive?: EventRouterMessageReceiver<Context>;
}

export interface BinaryEventTransceiverHandleMessageResult {
  message: EventRouterMessage<unknown>;
  receiveResult: EventRouterMessageReceiverResult<unknown>;
}

export class BinaryEventTransceiver<Context = void> {
  // Claiming the range 43_000 - 43_999 for the binary event protocol
  private messageEncoding = createEncoding<EventRouterMessage<unknown>>(43_000);

  constructor(private options: BinaryEventTransceiverOptions<Context>) {}

  send<Input>(message: EventRouterMessage<Input>) {
    if (!this.options.send) {
      throw new Error("No sender defined, send not supported.");
    }
    this.options.send(this.messageEncoding.encode(message));
  }

  handleMessage = (
    data: ArrayBufferLike,
    getContext: () => Context,
  ): BinaryEventTransceiverHandleMessageResult | undefined => {
    if (!this.options.receive) {
      throw new Error("No receiver defined, receive not supported.");
    }

    const decodeResult = this.messageEncoding.decode(data);
    if (decodeResult.isOk()) {
      const receiveResult = this.options.receive(
        decodeResult.value,
        getContext(),
      );
      return { message: decodeResult.value, receiveResult };
    }
  };
}
