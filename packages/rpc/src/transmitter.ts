import { err, ok, type Branded, type Result } from "@mp/std";

export class RPCTransmitter<Input, Output, Context = void> {
  private deferredPromises = new Map<
    ResponseId,
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
  ) {}

  async call(rpc: Call<Input>): Promise<Output> {
    this.sendCall(rpc);
    const accId = rpc[2];
    if (accId === undefined) {
      return void 0 as Output;
    }
    return new Promise<Output>((resolve, reject) =>
      this.deferredPromises.set(accId, { resolve, reject }),
    );
  }

  async handleCall(
    call: Call<Input>,
    context: Context,
  ): Promise<CallHandlerResult<Output>> {
    const responseId = call[2];
    const result = await this.invoke(call, context);

    if (responseId !== undefined) {
      this.sendResponse([
        responseId,
        result.isErr() ? { error: result.error } : { output: result.value },
      ]);
    }

    return ok(result);
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
        promise.reject(result.error);
      } else {
        promise.resolve(result.output);
      }

      return ok(void 0);
    } catch (error) {
      return err(new Error("Error resolving RPC response", { cause: error }));
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRPCTransmitter = RPCTransmitter<any, any, any>;

export type ResponseId = Branded<number, "ResponseId">;

export type Call<Input> = [path: string[], input: Input, id?: ResponseId];

export type Response<Output> = [
  id: ResponseId,
  { output: Output } | { error: ResponseError },
];

export type ResponseError = unknown;

export type CallHandlerResult<Output> = Result<InvokerResult<Output>, Error>;

export type ResponseHandlerResult = Result<void, Error>;

export type Invoker<Input, Output, Context = void> = (
  call: Call<Input>,
  context: Context,
) => Promise<InvokerResult<Output>>;

export type InvokerResult<Output> = Result<Output, InvokerError>;

export type InvokerError =
  | { type: "invalid-path" }
  | { type: "exception"; error: unknown };
