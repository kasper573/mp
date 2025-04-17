import * as tanstack from "@tanstack/solid-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/solid-query";
import { skipToken, type SkipToken } from "@tanstack/solid-query";
import type {
  AnyMutationNode,
  AnyQueryNode,
  AnyRouterNode,
  AnyRpcNode as AnyRpcNode,
} from "./builder";
import type { AnyFunction } from "./invocation-proxy";
import { createInvocationProxy } from "./invocation-proxy";
import type {
  inferOutput,
  inferInput,
  RpcProcedureInvoker,
} from "./proxy-invoker";
import type { AnyRpcTransmitter as AnyRpcTransmitter } from "./transmitter";

export function createSolidRpcInvoker<Node extends AnyRpcNode>(
  transmitter: AnyRpcTransmitter,
): SolidRpcInvoker<Node> {
  const proxy = createInvocationProxy((path) => {
    const last = path.at(-1);
    switch (last) {
      case useQueryProperty:
        return createUseQuery(transmitter, path.slice(0, -1)) as AnyFunction;
      case useMutationProperty:
        return createUseMutation(transmitter, path.slice(0, -1)) as AnyFunction;
    }
    return (input) => transmitter.call(path, input);
  });

  return proxy as SolidRpcInvoker<Node>;
}

function createUseQuery(
  transmitter: AnyRpcTransmitter,
  path: string[],
): UseQuery<AnyQueryNode> {
  function useQuery<MappedOutput>(
    options?: () => SolidRpcQueryOptions<unknown, unknown, MappedOutput>,
  ): UseQueryResult {
    return tanstack.useQuery(() => {
      const { input, throwOnError } = options?.() ?? {};
      return {
        queryKey: [path, input],
        queryFn: input === skipToken ? skipToken : queryFn,
        throwOnError,
      };
    });

    async function queryFn() {
      const { input, map } = options?.() ?? {};
      const result = (await transmitter.call(path, input)) as unknown;
      if (map) {
        return map(result, input);
      }
      return result;
    }
  }

  return useQuery as UseQuery<AnyQueryNode>;
}

function createUseMutation(
  transmitter: AnyRpcTransmitter,
  path: string[],
): UseMutation<AnyMutationNode> {
  return () => {
    return tanstack.useMutation(() => ({
      mutationKey: path,
      mutationFn: (input: unknown) => transmitter.call(path, input),
    }));
  };
}

export type SolidRpcInvoker<Node extends AnyRpcNode> =
  Node extends AnyRouterNode
    ? SolidRpcRouterInvoker<Node>
    : Node extends AnyQueryNode
      ? SolidRpcQueryInvoker<Node>
      : Node extends AnyMutationNode
        ? SolidRpcMutationInvoker<Node>
        : never;

export type SolidRpcRouterInvoker<Router extends AnyRouterNode> = {
  [K in keyof Router["routes"]]: SolidRpcInvoker<Router["routes"][K]>;
};

export interface SolidRpcQueryOptions<Input, Output, MappedOutput> {
  input: Input | tanstack.SkipToken;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
  throwOnError?: boolean;
}

export interface SolidRpcQueryInvoker<Node extends AnyQueryNode>
  extends RpcProcedureInvoker<Node> {
  [useQueryProperty]: UseQuery<Node>;
}

export interface UseQuery<Node extends AnyQueryNode> {
  /**
   * Returns a @tanstack/solid-query query wrapper of the rpc procedure.
   */
  <MappedOutput = inferOutput<Node["handler"]>>(
    options?: () => SolidRpcQueryOptions<
      inferInput<Node["handler"]>,
      inferOutput<Node["handler"]>,
      MappedOutput
    >,
  ): UseQueryResult<MappedOutput, unknown>;
}

const useQueryProperty = "useQuery";
const useMutationProperty = "useMutation";

export interface UseMutation<Node extends AnyMutationNode> {
  /**
   * Returns a @tanstack/solid-query mutation wrapper of the rpc procedure.
   */
  (): UseMutationResult<
    inferInput<Node["handler"]>,
    unknown,
    inferOutput<Node["handler"]>
  >;
}
export interface SolidRpcMutationInvoker<Node extends AnyMutationNode>
  extends RpcProcedureInvoker<Node> {
  [useMutationProperty]: UseMutation<Node>;
}

export { skipToken, type SkipToken };
export { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
