import { err, ok, type Result } from "@mp/std";
import type { RpcInvokerResult } from "./invoker";
import {
  RpcInvokerError,
  type RpcCall,
  type RpcCallId,
  type RpcInvoker,
} from "./invoker";

export class RpcTransceiver<Input, Output, Context = void> {
  private idCounter: RpcCallId = 0 as RpcCallId;
  private resolvers = new Map<
    RpcCallId,
    (response: Response<Output>) => void
  >();

  constructor(
    private sendCall: (rpc: RpcCall<Input>) => void,
    private sendResponse: (response: Response<Output>) => void,
    private invoke: RpcInvoker<Input, Output, Context> = (call) =>
      Promise.resolve(err(new RpcInvokerError(call, "Invoke not supported"))),
    private formatResponseError: (error: unknown) => unknown = (error) => error,
  ) {}

  async call(path: string[], input: Input): Promise<Output> {
    const id = this.nextId();
    const call: RpcCall<Input> = [path, input, id];
    this.sendCall(call);

    const [, result] = await new Promise<Response<Output>>((resolve) =>
      this.resolvers.set(id, resolve),
    );

    if ("error" in result) {
      throw result.error;
    }

    return result.output;
  }

  async handleCall(
    call: RpcCall<Input>,
    context: Context,
  ): Promise<RpcInvokerResult<Input, Output>> {
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

  handleResponse(response: Response<Output>): ResponseHandlerResult {
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
export type AnyRpcTransceiver = RpcTransceiver<any, any, any>;

export type Response<Output> = [
  id: RpcCallId,
  { output: Output } | { error: unknown },
];

export type ResponseHandlerResult = Result<void, unknown>;
