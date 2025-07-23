import { rpcCallEncoding, rpcResponseEncoding } from "./binary-transceiver";
import type { RpcCallId } from "./rpc-invoker";

export interface BinaryRpcBrokerOptions {
  sendCall: (data: ArrayBufferLike) => unknown;
  sendResponse: (data: ArrayBufferLike) => unknown;
}

export class BinaryRpcBroker {
  private pendingCallIds = new Set<RpcCallId>();

  constructor(private options: BinaryRpcBrokerOptions) {}

  handleMessage = async (data: ArrayBufferLike): Promise<boolean> => {
    const call = rpcCallEncoding.decode(data);
    if (call.isOk()) {
      const [, , callId] = call.value;
      this.pendingCallIds.add(callId);
      await this.options.sendCall(data);
      return true;
    }

    const response = rpcResponseEncoding.decode(data);
    if (response.isOk()) {
      const [callId] = response.value;
      if (this.pendingCallIds.has(callId)) {
        this.pendingCallIds.delete(callId);
        await this.options.sendResponse(data);
      }
      return true;
    }

    return false; // Unrecognized message. Someone else should handle it.
  };
}
