import * as tanstack from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { skipToken } from "@tanstack/react-query";
import type {
  AnyMutationNode,
  AnyQueryNode,
  AnyRouterNode,
  AnyRpcNode,
  InferInput,
  InferOutput,
} from "./builder";
import type { AnyFunction } from "./invocation-proxy";
import { createInvocationProxy } from "./invocation-proxy";
import type { RpcCaller, RpcProcedureInvoker } from "./proxy-invoker";
import { useSignal } from "@mp/state/react";
import type { ReadonlySignal } from "@mp/state";
import { useEffect, useMemo } from "preact/hooks";

export { useQuery, skipToken, type SkipToken } from "@tanstack/react-query";

export function useQuerySignal<
  TQueryFnData = unknown,
  TError = tanstack.DefaultError,
  TData = TQueryFnData,
  TQueryKey extends tanstack.QueryKey = tanstack.QueryKey,
>(
  options: tanstack.UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): Omit<tanstack.UseQueryResult<TData, TError>, "data"> & {
  signal: ReadonlySignal<TData | undefined>;
} {
  const result = tanstack.useQuery(options);
  const dataSignal = useSignal(result.data);
  useEffect(() => {
    dataSignal.value = result.data;
  }, [result.data, dataSignal]);
  return useMemo(
    () => ({
      ...result,
      signal: dataSignal,
    }),
    [result, dataSignal],
  );
}

export { ReactQueryDevtools } from "@tanstack/react-query-devtools";

export function createReactRpcInvoker<Node extends AnyRpcNode>(
  call: RpcCaller,
): ReactRpcInvoker<Node> {
  const proxy = createInvocationProxy((path) => {
    const last = path.at(-1);
    switch (last) {
      case useQueryProperty:
        return createUseQuery(call, path.slice(0, -1)) as AnyFunction;
      case useSuspenseQueryProperty:
        return createUseSuspenseQuery(call, path.slice(0, -1)) as AnyFunction;
      case useMutationProperty:
        return createUseMutation(call, path.slice(0, -1)) as AnyFunction;
    }
    return (input) => call(path, input);
  });

  return proxy as ReactRpcInvoker<Node>;
}

function createUseQuery(
  call: RpcCaller,
  path: string[],
): UseQuery<AnyQueryNode> {
  function useQuery<MappedOutput>(
    options?: ReactRpcQueryOptions<unknown, unknown, MappedOutput>,
  ): tanstack.UseQueryResult {
    // oxlint-disable-next-line no-unused-vars Needs to be omitted to not pass to tanstack
    const { input, map, ...tanstackOptions } = options ?? {};
    return tanstack.useQuery({
      queryKey: [path, input],
      queryFn: input === skipToken ? skipToken : queryFn,
      ...tanstackOptions,
    });

    async function queryFn() {
      const { input, map } = options ?? {};
      const result = await call(path, input);
      if (map) {
        return map(result, input);
      }
      return result;
    }
  }

  return useQuery as UseQuery<AnyQueryNode>;
}

function createUseSuspenseQuery(
  call: RpcCaller,
  path: string[],
): UseQuery<AnyQueryNode> {
  function useQuery<MappedOutput>(
    options?: ReactRpcQueryOptions<unknown, unknown, MappedOutput>,
  ): tanstack.UseSuspenseQueryResult {
    // oxlint-disable-next-line no-unused-vars Needs to be omitted to not pass to tanstack
    const { input, map, ...tanstackOptions } = options ?? {};
    return tanstack.useSuspenseQuery({
      queryKey: [path, input],
      queryFn,
      ...tanstackOptions,
    });

    async function queryFn() {
      const { input, map } = options ?? {};
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
    return tanstack.useMutation({
      mutationKey: path,
      mutationFn: (input: unknown) => call(path, input),
    });
  };
}

export type ReactRpcInvoker<Node extends AnyRpcNode> =
  Node extends AnyRouterNode
    ? ReactRpcRouterInvoker<Node>
    : Node extends AnyQueryNode
      ? ReactRpcQueryInvoker<Node>
      : Node extends AnyMutationNode
        ? ReactRpcMutationInvoker<Node>
        : never;

export type ReactRpcRouterInvoker<Router extends AnyRouterNode> = {
  [K in keyof Router["routes"]]: ReactRpcInvoker<Router["routes"][K]>;
};

export interface ReactRpcQueryOptions<Input, Output, MappedOutput>
  extends Omit<
    tanstack.UseQueryOptions<Input, tanstack.DefaultError, Output>,
    "initialData" | "queryKey" | "queryFn" | "select"
  > {
  input: Input | tanstack.SkipToken;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
}

export interface ReactRpcSuspenseQueryOptions<Input, Output, MappedOutput>
  extends Omit<
    tanstack.UseQueryOptions<Input, tanstack.DefaultError, Output>,
    "initialData" | "queryKey" | "queryFn" | "select" | "enabled"
  > {
  input: Input;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
}

export interface ReactRpcQueryInvoker<Node extends AnyQueryNode>
  extends RpcProcedureInvoker<Node> {
  [useQueryProperty]: UseQuery<Node>;
  [useSuspenseQueryProperty]: UseSuspenseQuery<Node>;
}

export type UseQuery<Node extends AnyQueryNode> = <
  MappedOutput = InferOutput<Node["handler"]>,
>(
  options?: ReactRpcQueryOptions<
    InferInput<Node["handler"]>,
    InferOutput<Node["handler"]>,
    MappedOutput
  >,
) => tanstack.UseQueryResult<MappedOutput, unknown>;

export type UseSuspenseQuery<Node extends AnyQueryNode> = <
  MappedOutput = InferOutput<Node["handler"]>,
>(
  options?: ReactRpcSuspenseQueryOptions<
    InferInput<Node["handler"]>,
    InferOutput<Node["handler"]>,
    MappedOutput
  >,
) => tanstack.UseSuspenseQueryResult<MappedOutput, unknown>;

const useSuspenseQueryProperty = "useSuspenseQuery";
const useQueryProperty = "useQuery";
const useMutationProperty = "useMutation";

export type UseMutation<Node extends AnyMutationNode> = () => UseMutationResult<
  InferInput<Node["handler"]>,
  unknown,
  InferOutput<Node["handler"]>
>;
export interface ReactRpcMutationInvoker<Node extends AnyMutationNode>
  extends RpcProcedureInvoker<Node> {
  [useMutationProperty]: UseMutation<Node>;
}

export { QueryClient, QueryClientProvider } from "@tanstack/react-query";
