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

  handleMessage = async (
    data: ArrayBufferLike,
    context: Context,
  ): Promise<BinaryEventTransceiverHandleMessageResult | undefined> => {
    if (!this.options.receive) {
      throw new Error("No receiver defined, receive not supported.");
    }

    const decodeResult = this.messageEncoding.decode(data);
    if (decodeResult.isOk()) {
      const receiveResult = await this.options.receive(
        decodeResult.value,
        context,
      );
      return { message: decodeResult.value, receiveResult };
    }
  };

  /**
   * Convenience method to easily bind event based message handlers
   * The returned event handler will pipe all errors to the given event handler.
   * This is because most event expect a void return.
   * If you need to handle the promise, use the handleMessage method directly.
   */
  messageEventHandler = (
    errorHandler: (error: unknown) => void,
    context: Context,
  ) => {
    return (event: { data: ArrayBufferLike }): void => {
      const handle = async () => {
        try {
          const out = await this.handleMessage(event.data, context);
          if (out?.receiveResult.isErr()) {
            errorHandler(out.receiveResult.error);
          }
        } catch (error) {
          errorHandler(error);
        }
      };

      void handle();
    };
  };
}
