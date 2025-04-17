import type { Branded, Result } from "@mp/std";
import { err, ok } from "@mp/std";
import type { AnyRouteRecord, AnyRpcNode, RouterNode } from "./builder";

export function createRpcInvoker<Input, Output, Context>(
  root: RouterNode<AnyRouteRecord<Context>>,
): RpcInvoker<Input, Output, Context> {
  return async function invokeRpc(call, ctx) {
    const [path, input] = call;
    const node = resolveRpcNode<Context>(root, path);
    if (!node || node.type === "router") {
      return err("Rpc path not found: " + path.join("."));
    }

    try {
      const mwc = undefined; // The first handler never has a middleware context
      const output = (await node.handler({ ctx, input, mwc })) as Output;
      return ok(output);
    } catch (error) {
      return err(error);
    }
  };
}

function resolveRpcNode<Context>(
  start: AnyRpcNode,
  path: string[],
): AnyRpcNode<Context> | undefined {
  let node: AnyRpcNode | undefined = start;
  for (const key of path) {
    if (node.type === "router") {
      node = node.routes[key];
    }
  }
  return node;
}

export class RpcInvokerError<Input> extends Error {
  constructor(call: RpcCall<Input>, cause: unknown) {
    super(`Rpc handler "${call[0].join(".")}" had an error`, { cause });
    this.name = "InvokerError";
  }
}

export type RpcInvoker<Input, Output, Context = void> = (
  call: RpcCall<Input>,
  context: Context,
) => Promise<RpcInvokerResult<Output>>;

export type RpcInvokerResult<Output> = Result<Output, unknown>;

export type RpcCallId = Branded<number, "RpcCallId">;

export type RpcCall<Input> = [path: string[], input: Input, id: RpcCallId];
