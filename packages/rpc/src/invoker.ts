import type { AnyRouterNode } from "./builder";
import type { Invoker } from "./transmitter";

export function createRPCInvoker<Input, Output>(
  router: AnyRouterNode,
): Invoker<Input, Output> {
  throw new Error("Not implemented");
}
