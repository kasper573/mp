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
}
