import { createEncoding } from "@mp/encoding";
import type { Response } from "./transceiver";
import { RpcTransceiver } from "./transceiver";
import type { RpcCall, RpcInvoker } from "./invoker";

export class BinaryRpcTransceiver<
  Input,
  Output,
  Context = void,
> extends RpcTransceiver<Input, Output, Context> {
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
      const result = await this.handleCall(call.value, context);
      return { call: call.value, result };
    }

    const response = this.responseEncoding.decode(data);
    if (response.isOk()) {
      const result = this.handleResponse(response.value);
      return { response: response.value, result };
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
          const out = await this.handleMessage(event.data, context);
          if (out?.result?.isErr()) {
            errorHandler(out.result.error);
          }
        } catch (error) {
          errorHandler(error);
        }
      };

      void handle();
    };
  };
}
