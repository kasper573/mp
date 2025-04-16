import { createResource } from "solid-js";
import type {
  AnyMutationNode,
  AnyQueryNode,
  AnyRouterNode,
  AnyRPCNode,
} from "./builder";
import type { AnyFunction } from "./invocation-proxy";
import { createInvocationProxy } from "./invocation-proxy";
import type { inferOutput, inferInput } from "./proxy-invoker";
import type { AnyRPCTransmitter } from "./transmitter";

export function createSolidRPCInvoker<Node extends AnyRPCNode>(
  transmitter: AnyRPCTransmitter,
): SolidRPCInvoker<Node> {
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

  return proxy as SolidRPCInvoker<Node>;
}

function createUseQuery(
  transmitter: AnyRPCTransmitter,
  path: string[],
): UseQuery<AnyQueryNode> {
  function useQuery<MappedOutput>(
    options?: () => SolidRPCQueryOptions<unknown, unknown, MappedOutput>,
  ): UseQueryReturn<unknown> {
    const [resource, { refetch }] = createResource(async () => {
      const { input, map } = options?.() ?? {};
      if (input === skipToken) {
        return;
      }
      const result = (await transmitter.call([path, input])) as unknown;

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
  transmitter: AnyRPCTransmitter,
  path: string[],
): UseMutation<AnyMutationNode> {
  const mutation = {
    mutate: (input: unknown) => void transmitter.call([path, input]),
    mutateAsync: (input: unknown) => transmitter.call([path, input]),
  };
  return () => mutation;
}

export type SolidRPCInvoker<Node extends AnyRPCNode> =
  Node extends AnyRouterNode
    ? SolidRPCRouterInvoker<Node>
    : Node extends AnyQueryNode
      ? SolidRPCQueryInvoker<Node>
      : Node extends AnyMutationNode
        ? SolidRPCMutationInvoker<Node>
        : never;

export type SolidRPCRouterInvoker<Router extends AnyRouterNode> = {
  [K in keyof Router["routes"]]: SolidRPCInvoker<Router["routes"][K]>;
};

export interface SolidRPCQueryOptions<Input, Output, MappedOutput> {
  input: Input | SkipToken;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
}

export interface SolidRPCQueryInvoker<Node extends AnyQueryNode> {
  [useQueryProperty]: UseQuery<Node>;
}

export interface UseQuery<Node extends AnyQueryNode> {
  <MappedOutput = inferOutput<Node["handler"]>>(
    options?: () => SolidRPCQueryOptions<
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
export interface SolidRPCMutationInvoker<Node extends AnyMutationNode> {
  [useMutationProperty]: UseMutation<Node>;
}

export interface UseMutationReturn<Input, Output> {
  mutate: (input: Input) => void;
  mutateAsync: (input: Input) => Promise<Output>;
}

export type SkipToken = typeof skipToken;
export const skipToken = Symbol("skipToken");
