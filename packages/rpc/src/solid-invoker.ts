import * as tanstack from "@tanstack/solid-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/solid-query";
import { skipToken } from "@tanstack/solid-query";
import type {
  AnyMutationNode,
  AnyQueryNode,
  AnyRouterNode,
  AnyRpcNode as AnyRpcNode,
  InferInput,
  InferOutput,
} from "./builder";
import type { AnyFunction } from "./invocation-proxy";
import { createInvocationProxy } from "./invocation-proxy";
import type { RpcCaller, RpcProcedureInvoker } from "./proxy-invoker";

export { useQuery, skipToken, type SkipToken } from "@tanstack/solid-query";

export { SolidQueryDevtools } from "@tanstack/solid-query-devtools";

export function createSolidRpcInvoker<Node extends AnyRpcNode>(
  call: RpcCaller,
): SolidRpcInvoker<Node> {
  const proxy = createInvocationProxy((path) => {
    const last = path.at(-1);
    switch (last) {
      case useQueryProperty:
        return createUseQuery(call, path.slice(0, -1)) as AnyFunction;
      case useMutationProperty:
        return createUseMutation(call, path.slice(0, -1)) as AnyFunction;
    }
    return (input) => call(path, input);
  });

  return proxy as SolidRpcInvoker<Node>;
}

function createUseQuery(
  call: RpcCaller,
  path: string[],
): UseQuery<AnyQueryNode> {
  function useQuery<MappedOutput>(
    options?: () => SolidRpcQueryOptions<unknown, unknown, MappedOutput>,
  ): UseQueryResult {
    return tanstack.useQuery(() => {
      const { input, map, ...tanstackOptions } = options?.() ?? {};
      return {
        queryKey: [path, input],
        queryFn: input === skipToken ? skipToken : queryFn,
        ...tanstackOptions,
      };
    });

    async function queryFn() {
      const { input, map } = options?.() ?? {};
      const result = await call(path, input);
      if (map) {
        return map(result, input);
      }
      return result;
    }
  }

  return useQuery as UseQuery<AnyQueryNode>;
}

function createUseMutation(
  call: RpcCaller,
  path: string[],
): UseMutation<AnyMutationNode> {
  return () => {
    return tanstack.useMutation(() => ({
      mutationKey: path,
      mutationFn: (input: unknown) => call(path, input),
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

export interface SolidRpcQueryOptions<Input, Output, MappedOutput>
  extends Omit<
    tanstack.SolidQueryOptions<Input, tanstack.DefaultError, Output>,
    "initialData" | "queryKey" | "queryFn" | "select"
  > {
  input: Input | tanstack.SkipToken;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
}

export interface SolidRpcQueryInvoker<Node extends AnyQueryNode>
  extends RpcProcedureInvoker<Node> {
  [useQueryProperty]: UseQuery<Node>;
}

export interface UseQuery<Node extends AnyQueryNode> {
  /**
   * Returns a @tanstack/solid-query query wrapper of the rpc procedure.
   */
  <MappedOutput = InferOutput<Node["handler"]>>(
    options?: () => SolidRpcQueryOptions<
      InferInput<Node["handler"]>,
      InferOutput<Node["handler"]>,
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
    InferInput<Node["handler"]>,
    unknown,
    InferOutput<Node["handler"]>
  >;
}
export interface SolidRpcMutationInvoker<Node extends AnyMutationNode>
  extends RpcProcedureInvoker<Node> {
  [useMutationProperty]: UseMutation<Node>;
}

export { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
