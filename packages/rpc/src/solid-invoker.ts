import { createResource } from "solid-js";
import type {
  AnyMutationNode,
  AnyQueryNode,
  AnyRouterNode,
  AnyRpcNode as AnyRpcNode,
} from "./builder";
import type { AnyFunction } from "./invocation-proxy";
import { createInvocationProxy } from "./invocation-proxy";
import type { inferOutput, inferInput } from "./proxy-invoker";
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
    throw new Error("Cannot invoke: " + path.join("."));
  });

  return proxy as SolidRpcInvoker<Node>;
}

function createUseQuery(
  transmitter: AnyRpcTransmitter,
  path: string[],
): UseQuery<AnyQueryNode> {
  function useQuery<MappedOutput>(
    options?: () => SolidRpcQueryOptions<unknown, unknown, MappedOutput>,
  ): UseQueryReturn<unknown> {
    const [resource, { refetch }] = createResource(async () => {
      const { input, map } = options?.() ?? {};
      if (input === skipToken) {
        return;
      }
      const result = (await transmitter.call(path, input)) as unknown;

      if (map) {
        return map(result, input);
      }
      return result;
    });

    const query: UseQueryReturn<unknown> = {
      get isLoading() {
        return resource.loading;
      },
      data: resource(),
      get error() {
        return resource.error as unknown;
      },
      refetch,
    };

    return query;
  }

  return useQuery as UseQuery<AnyQueryNode>;
}

function createUseMutation(
  transmitter: AnyRpcTransmitter,
  path: string[],
): UseMutation<AnyMutationNode> {
  const mutation = {
    mutate: (input: unknown) => void transmitter.call(path, input),
    mutateAsync: (input: unknown) => transmitter.call(path, input),
  };
  return () => mutation;
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
  input: Input | SkipToken;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
}

export interface SolidRpcQueryInvoker<Node extends AnyQueryNode> {
  [useQueryProperty]: UseQuery<Node>;
}

export interface UseQuery<Node extends AnyQueryNode> {
  <MappedOutput = inferOutput<Node["handler"]>>(
    options?: () => SolidRpcQueryOptions<
      inferInput<Node["handler"]>,
      inferOutput<Node["handler"]>,
      MappedOutput
    >,
  ): UseQueryReturn<MappedOutput>;
}

export interface UseQueryReturn<Output> {
  data?: Output;
  error?: unknown;
  isLoading: boolean;
  refetch: () => void;
}

const useQueryProperty = "createQuery";
const useMutationProperty = "createMutation";

export interface UseMutation<Node extends AnyMutationNode> {
  (): UseMutationReturn<
    inferInput<Node["handler"]>,
    inferOutput<Node["handler"]>
  >;
}
export interface SolidRpcMutationInvoker<Node extends AnyMutationNode> {
  [useMutationProperty]: UseMutation<Node>;
}

export interface UseMutationReturn<Input, Output> {
  mutate: (input: Input) => void;
  mutateAsync: (input: Input) => Promise<Output>;
}

export type SkipToken = typeof skipToken;
export const skipToken = Symbol("skipToken");
