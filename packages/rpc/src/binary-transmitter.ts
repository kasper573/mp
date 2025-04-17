import { createEncoding } from "@mp/encoding";
import type { Response } from "./transmitter";
import { RpcTransmitter } from "./transmitter";
import type { RpcCall, RpcInvoker } from "./invoker";

export class BinaryRpcTransmitter<
  Input,
  Output,
  Context = void,
> extends RpcTransmitter<Input, Output, Context> {
  // Claiming the range 41_000 - 41_999 for the binary Rpc protocol
  private callEncoding = createEncoding<RpcCall<Input>>(41_000);
  private responseEncoding = createEncoding<Response<Output>>(41_001);

  constructor(
    send: (messageBuffer: ArrayBufferLike) => void,
    invoke?: RpcInvoker<Input, Output, Context>,
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
    if (call.isOk()) {
      return this.handleCall(call.value, context);
    }

    const response = this.responseEncoding.decode(data);
    if (response.isOk()) {
      return this.handleResponse(response.value);
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
      const handle = async () => {
        try {
          const res = await this.handleMessage(event.data, context);
          if (res?.isErr()) {
            errorHandler(res.error);
          }
        } catch (error) {
          errorHandler(error);
        }
      };

      void handle();
    };
  };
}
