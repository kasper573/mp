import { err, ok, type Result } from "@mp/std";
import type { RpcInvokerResult } from "./rpc-invoker";
import {
  RpcInvokerError,
  type RpcCall,
  type RpcCallId,
  type RpcInvoker,
} from "./rpc-invoker";
import type { RpcCaller } from "./proxy-invoker";

export interface RpcTransceiverOptions<Context> {
  sendCall: (rpc: RpcCall<unknown>) => void;
  sendResponse: (response: RcpResponse<unknown>) => void;
  invoke?: RpcInvoker<Context>;
  formatResponseError?: (error: unknown) => unknown;
  timeout?: number;
  requiresResponse?: (call: RpcCall<unknown>) => boolean;
}

export class RpcTransceiver<Context = void> {
  private idCounter: RpcCallId = 0 as RpcCallId;
  private resolvers = new Map<
    RpcCallId,
    (response: RcpResponse<unknown>) => void
  >();

  constructor(private options: RpcTransceiverOptions<Context>) {}

  private requiresResponse(call: RpcCall<unknown>): boolean {
    return this.options.requiresResponse?.(call) ?? true;
  }

  call: RpcCaller = async (path, input) => {
    const { sendCall, timeout } = this.options;

    const id = this.nextId();
    const call: RpcCall<unknown> = [path, input, id];
    sendCall(call);

    if (!this.requiresResponse(call)) {
      return;
    }

    let timeoutId: number | undefined;
    if (timeout !== undefined) {
      timeoutId = setTimeout(() => {
        const timeoutError = new RpcInvokerError(call, `Timeout`);
        this.resolvers.get(id)?.([id, { error: timeoutError }]);
      }, timeout);
    }

    try {
      const [, result] = await new Promise<RcpResponse<unknown>>((resolve) =>
        this.resolvers.set(id, resolve),
      );

      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }

      if ("error" in result) {
        throw new RpcRemoteError(
          "Remote responded with an error",
          result.error,
        );
      }
      return result.output;
    } finally {
      this.resolvers.delete(id);
    }
  };

  handleCall = async (
    call: RpcCall<unknown>,
    context: Context,
  ): Promise<RpcInvokerResult<unknown, unknown>> => {
    const {
      invoke,
      formatResponseError = passThrough,
      sendResponse,
    } = this.options;

    if (!invoke) {
      return err(new RpcInvokerError(call, "No invoke function provided"));
    }

    const id = call[2];
    const result = await invoke(call, context);

    if (this.requiresResponse(call)) {
      sendResponse([
        id,
        result.isErr()
          ? { error: formatResponseError(result.error) }
          : { output: result.value },
      ]);
    }

    return result;
  };

  handleResponse = (response: RcpResponse<unknown>): HandleResponseResult => {
    const [callId] = response;
    const resolve = this.resolvers.get(callId);
    if (!resolve) {
      return err(new Error("Unknown callId: " + callId));
    }

    try {
      resolve(response);
      return ok(void 0);
    } catch (error) {
      return err(new Error("Error resolving Rpc response", { cause: error }));
    }
  };

  private nextId(): RpcCallId {
    return this.idCounter++ as RpcCallId;
  }
}

export class RpcRemoteError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "RpcRemoteError";
  }
}

// oxlint-disable-next-line no-explicit-any
export type AnyRpcTransceiver = RpcTransceiver<any>;

export type RcpResponse<Output> = [
  id: RpcCallId,
  { output: Output } | { error: unknown },
];

export type HandleResponseResult = Result<void, unknown>;

declare function setTimeout(callback: () => void, ms: number): number;
declare function clearTimeout(timeoutId: number): void;

const passThrough = <T>(value: T): T => value;
