import { createEncoding } from "@mp/encoding";
import type { RcpResponse, RpcTransceiverOptions } from "./transceiver";
import { RpcTransceiver } from "./transceiver";
import type { RpcCall } from "./rpc-invoker";

export interface BinaryRpcTransceiverOptions<Context>
  extends Omit<RpcTransceiverOptions<Context>, "sendCall" | "sendResponse"> {
  send: (messageBuffer: ArrayBufferLike) => unknown;
}

export class BinaryRpcTransceiver<
  Context = void,
> extends RpcTransceiver<Context> {
  // Claiming the range 41_000 - 41_999 for the binary Rpc protocol
  private callEncoding = createEncoding<RpcCall<unknown>>(41_000);
  private responseEncoding = createEncoding<RcpResponse<unknown>>(41_001);

  constructor({ send, ...options }: BinaryRpcTransceiverOptions<Context>) {
    super({
      ...options,
      sendCall: (call) => {
        send(this.callEncoding.encode(call));
      },
      sendResponse: (response) => {
        send(this.responseEncoding.encode(response));
      },
    });
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
  messageEventHandler = (
    errorHandler: (error: unknown) => void,
    context: Context,
  ) => {
    return (event: { data: ArrayBufferLike }): void => {
      const handle = async () => {
        try {
          const out = await this.handleMessage(event.data, context);
          if (out?.result.isErr()) {
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
