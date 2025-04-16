import { err, ok } from "@mp/std";
import type { AnyRouteRecord, AnyRPCNode, RouterNode } from "./builder";
import type { Invoker } from "./transmitter";

export function createRPCInvoker<Input, Output, Context>(
  root: RouterNode<AnyRouteRecord<Context>>,
): Invoker<Input, Output, Context> {
  return async function invokeRPC(call, ctx) {
    const [path, input] = call;
    const node = resolveProcedureNode<Context>(root, path);
    if (!node || node.type === "router") {
      return err({ type: "invalid-path" });
    }

    try {
      const mwc = undefined; // The first handler never has a middleware context
      const output = (await node.handler({ ctx, input, mwc })) as Output;
      return ok(output);
    } catch (error) {
      return err({ type: "exception", error });
    }
  };
}

function resolveProcedureNode<Context>(
  start: AnyRPCNode,
  path: string[],
): AnyRPCNode<Context> | undefined {
  let node: AnyRPCNode | undefined = start;
  for (const key of path) {
    if (node.type === "router") {
      node = node.routes[key];
    }
  }
  return node;
}
