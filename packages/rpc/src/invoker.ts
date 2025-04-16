import { err } from "@mp/std";
import type {
  AnyRouteRecord,
  AnyRPCNode,
  MutationNode,
  QueryNode,
  RouterNode,
} from "./builder";
import type { Invoker } from "./transmitter";

export function createRPCInvoker<Input, Output, Context>(
  root: RouterNode<AnyRouteRecord<Context>>,
): Invoker<Input, Output, Context> {
  return async function invokeRPC(call, ctx) {
    const [path, input, callId] = call;
    const node = resolveProcedureNode<Input, Output, Context>(root, path);
    if (!node) {
      return err({ type: "invalid-path" });
    }

    const output = await node.handler({ ctx, input, mwc: undefined });

    throw new Error("Not implemented");
  };
}

function resolveProcedureNode<Input, Output, Context>(
  start: AnyRPCNode,
  path: string[],
):
  | QueryNode<Input, Output, Context, unknown>
  | MutationNode<Input, Output, Context, unknown>
  | undefined {
  throw new Error("Not implemented");
}
