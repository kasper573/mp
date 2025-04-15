import { encode, decode } from "@mp/encoding";
import type { Call, Invoker, Response } from "./transmitter";
import { RPCTransmitter } from "./transmitter";

export class BinaryRPCTransmitter<Input, Output> extends RPCTransmitter<
  Input,
  Output
> {
  constructor(
    send: (messageBuffer: Uint8Array<ArrayBufferLike>) => void,
    invoke?: Invoker<Input, Output>,
  ) {
    super(
      (call) => send(encode({ call })),
      (response) => send(encode({ response })),
      invoke,
    );
  }

  handleMessage = async (messageBuffer: ArrayBufferLike) => {
    const decoded = decode(messageBuffer);
    if (decoded && typeof decoded === "object") {
      if ("call" in decoded) {
        return await this.handleCall(decoded.call as Call<Input>);
      } else if ("response" in decoded) {
        return this.handleResponse(decoded.response as Response<Output>);
      }
    }
  };
}
