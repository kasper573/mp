import { createEncoding } from "@mp/encoding";
import type { Call, Invoker, Response } from "./transmitter";
import { RPCTransmitter } from "./transmitter";

export class BinaryRPCTransmitter<
  Input,
  Output,
  Context = void,
> extends RPCTransmitter<Input, Output, Context> {
  private callEncoding = createEncoding<Call<Input>>(41_000);
  private responseEncoding = createEncoding<Response<Output>>(41_001);

  constructor(
    send: (messageBuffer: ArrayBufferLike) => void,
    invoke?: Invoker<Input, Output, Context>,
  ) {
    super(
      (call) => send(this.callEncoding.encode(call)),
      (response) => send(this.responseEncoding.encode(response)),
      invoke,
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
   * (Common for sockets and other transports)
   */
  handleMessageEvent = (event: { data: ArrayBufferLike }, context: Context) => {
    // Promise is voided because most event emitters expect a void return.
    // If you need to handle the promise, use the handleMessage method directly.
    void this.handleMessage(event.data, context);
  };
}
