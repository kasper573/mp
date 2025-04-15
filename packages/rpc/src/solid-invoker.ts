import type {
  AnyMutationNode,
  AnyQueryNode,
  AnyRouterNode,
  AnyRPCNode,
  RPCError,
} from "./builder";
import type { inferOutput, inferInput } from "./invoker";

export function createSolidRPCInvoker<
  Node extends AnyRPCNode,
>(): SolidRPCInvoker<Node> {
  throw new Error("Not implemented");
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
  createQuery: <MappedOutput = inferOutput<Node["handler"]>>(
    options?: () => SolidRPCQueryOptions<
      inferInput<Node["handler"]>,
      inferOutput<Node["handler"]>,
      MappedOutput
    >,
  ) => UseQueryReturn<MappedOutput>;
  query: (
    input: inferInput<Node["handler"]>,
  ) => Promise<inferOutput<Node["handler"]>>;
}

export interface UseQueryReturn<Output> {
  data?: Output;
  error?: RPCError;
  isLoading: boolean;
  refetch: () => void;
}

export interface SolidRPCMutationInvoker<Node extends AnyMutationNode> {
  createMutation: () => UseMutationReturn<
    inferInput<Node["handler"]>,
    inferOutput<Node["handler"]>
  >;
  mutate: (
    input: inferInput<Node["handler"]>,
  ) => Promise<inferOutput<Node["handler"]>>;
}

export interface UseMutationReturn<Input, Output> {
  mutate: (input: Input) => void;
  mutateAsync: (input: Input) => Promise<Output>;
}

export type SkipToken = typeof skipToken;
export const skipToken = Symbol("skipToken");
