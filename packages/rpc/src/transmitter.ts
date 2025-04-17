import { err, ok, type Branded, type Result } from "@mp/std";

export class RPCTransmitter<Input, Output, Context = void> {
  private idCounter: CallId = 0 as CallId;
  private deferredPromises = new Map<
    CallId,
    {
      resolve: (result: Output) => void;
      reject: (error: unknown) => void;
    }
  >();

  constructor(
    private sendCall: (rpc: Call<Input>) => void,
    private sendResponse: (response: Response<Output>) => void,
    private invoke: Invoker<Input, Output, Context> = () => {
      throw new Error("Invoke not supported");
    },
    private formatResponseError: (error: unknown) => unknown = (error) => error,
  ) {}

  async call(path: string[], input: Input): Promise<Output> {
    const id = this.nextId();
    const call: Call<Input> = [path, input, id];
    this.sendCall(call);
    return new Promise<Output>((resolve, reject) =>
      this.deferredPromises.set(id, { resolve, reject }),
    );
  }

  async handleCall(
    call: Call<Input>,
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
      return err(new Error("Error resolving RPC response", { cause: error }));
    }
  }

  private nextId(): CallId {
    return this.idCounter++ as CallId;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRPCTransmitter = RPCTransmitter<any, any, any>;

export type CallId = Branded<number, "CallId">;

export type Call<Input> = [path: string[], input: Input, id: CallId];

export type Response<Output> = [
  id: CallId,
  { output: Output } | { error: unknown },
];

export type CallHandlerResult<Input, Output> = Result<
  { call: Call<Input>; output: Output },
  unknown
>;

export type ResponseHandlerResult = Result<void, unknown>;

export type Invoker<Input, Output, Context = void> = (
  call: Call<Input>,
  context: Context,
) => Promise<InvokerResult<Output>>;

export type InvokerResult<Output> = Result<Output, unknown>;
