import { createEncoding } from "@mp/encoding";
import type { Call, Invoker, Response } from "./transmitter";
import { RPCTransmitter } from "./transmitter";

export class BinaryRPCTransmitter<
  Input,
  Output,
  Context = void,
> extends RPCTransmitter<Input, Output, Context> {
  // Claiming the range 41_000 - 41_999 for the binary RPC protocol
  private callEncoding = createEncoding<Call<Input>>(41_000);
  private responseEncoding = createEncoding<Response<Output>>(41_001);

  constructor(
    send: (messageBuffer: ArrayBufferLike) => void,
    invoke?: Invoker<Input, Output, Context>,
    formatResponseError?: (error: unknown) => unknown,
  ) {
    super(
      (call) => send(this.callEncoding.encode(call)),
      (response) => send(this.responseEncoding.encode(response)),
      invoke,
      formatResponseError,
    );
  }

  handleMessage = async (data: ArrayBufferLike, context: Context) => {
    const call = this.callEncoding.decode(data);
    if (call) {
      return this.handleCall(call, context);
    }

    const response = this.responseEncoding.decode(data);
    if (response) {
      return this.handleResponse(response);
    }
  };

  /**
   * Convenience method to easily bind event based message handlers
   * The returned event handler will pipe all errors to the given event handler.
   * This is because most event expect a void return.
   * If you need to handle the promise, use the handleMessage method directly.
   */
  messageEventHandler = (errorHandler: (error: unknown) => void) => {
    return (event: { data: ArrayBufferLike }, context: Context): void => {
      void this.handleMessage(event.data, context)
        .then((result) => {
          if (result?.isErr()) {
            errorHandler(result.error);
          }
        })
        .catch(errorHandler);
    };
  };
}
