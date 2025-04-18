import { err, ok, type Result } from "@mp/std";
import type { RpcInvokerResult } from "./invoker";
import {
  RpcInvokerError,
  type RpcCall,
  type RpcCallId,
  type RpcInvoker,
} from "./invoker";

export class RpcTransceiver<Context = void> {
  private idCounter: RpcCallId = 0 as RpcCallId;
  private resolvers = new Map<
    RpcCallId,
    (response: Response<unknown>) => void
  >();

  constructor(
    private sendCall: (rpc: RpcCall<unknown>) => void,
    private sendResponse: (response: Response<unknown>) => void,
    private invoke: RpcInvoker<Context> = (call) =>
      Promise.resolve(err(new RpcInvokerError(call, "Invoke not supported"))),
    private formatResponseError: (error: unknown) => unknown = (error) => error,
  ) {}

  async call(path: string[], input: unknown): Promise<unknown> {
    const id = this.nextId();
    const call: RpcCall<unknown> = [path, input, id];
    this.sendCall(call);

    const [, result] = await new Promise<Response<unknown>>((resolve) =>
      this.resolvers.set(id, resolve),
    );

    if ("error" in result) {
      throw result.error;
    }

    return result.output;
  }

  async handleCall(
    call: RpcCall<unknown>,
    context: Context,
  ): Promise<RpcInvokerResult<unknown, unknown>> {
    const id = call[2];
    const result = await this.invoke(call, context);

    this.sendResponse([
      id,
      result.isErr()
        ? { error: this.formatResponseError(result.error) }
        : { output: result.value },
    ]);

    return result;
  }

  handleResponse(response: Response<unknown>): ResponseHandlerResult {
    const [callId] = response;
    const resolve = this.resolvers.get(callId);
    if (!resolve) {
      return err(new Error("Unknown callId: " + callId));
    }

    try {
      this.resolvers.delete(callId);
      resolve(response);
      return ok(void 0);
    } catch (error) {
      return err(new Error("Error resolving Rpc response", { cause: error }));
    }
  }

  private nextId(): RpcCallId {
    return this.idCounter++ as RpcCallId;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRpcTransceiver = RpcTransceiver<any>;

export type Response<Output> = [
  id: RpcCallId,
  { output: Output } | { error: unknown },
];

export type ResponseHandlerResult = Result<void, unknown>;
