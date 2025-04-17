import { err, ok, type Result } from "@mp/std";
import type { RpcCall, RpcCallId, RpcInvoker } from "./invoker";

export class RpcTransmitter<Input, Output, Context = void> {
  private idCounter: RpcCallId = 0 as RpcCallId;
  private deferredPromises = new Map<
    RpcCallId,
    {
      resolve: (result: Output) => void;
      reject: (error: unknown) => void;
    }
  >();

  constructor(
    private sendCall: (rpc: RpcCall<Input>) => void,
    private sendResponse: (response: Response<Output>) => void,
    private invoke: RpcInvoker<Input, Output, Context> = () => {
      throw new Error("Invoke not supported");
    },
    private formatResponseError: (error: unknown) => unknown = (error) => error,
  ) {}

  async call(path: string[], input: Input): Promise<Output> {
    const id = this.nextId();
    const call: RpcCall<Input> = [path, input, id];
    this.sendCall(call);
    return new Promise<Output>((resolve, reject) =>
      this.deferredPromises.set(id, { resolve, reject }),
    );
  }

  async handleCall(
    call: RpcCall<Input>,
    context: Context,
  ): Promise<CallHandlerResult<Input, Output>> {
    const id = call[2];
    const result = await this.invoke(call, context);

    this.sendResponse([
      id,
      result.isErr()
        ? { error: this.formatResponseError(result.error) }
        : { output: result.value },
    ]);

    if (result.isErr()) {
      return err(result.error);
    }

    return ok({ call, output: result.value });
  }

  handleResponse(response: Response<Output>): ResponseHandlerResult {
    const [accId, result] = response;
    const promise = this.deferredPromises.get(accId);
    if (!promise) {
      return err(new Error("Unknown accId: " + accId));
    }

    try {
      this.deferredPromises.delete(accId);

      if ("error" in result) {
        return err(result.error);
      } else {
        promise.resolve(result.output);
      }

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
export type AnyRpcTransmitter = RpcTransmitter<any, any, any>;

export type Response<Output> = [
  id: RpcCallId,
  { output: Output } | { error: unknown },
];

export type CallHandlerResult<Input, Output> = Result<
  { call: RpcCall<Input>; output: Output },
  unknown
>;

export type ResponseHandlerResult = Result<void, unknown>;
