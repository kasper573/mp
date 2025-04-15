import type {
  AnyMutationNode,
  AnyProcedureNode,
  AnyQueryNode,
  AnyRouterNode,
  AnyRPCNode,
  ProcedureHandler,
  RPCError,
} from "./builder";

export function createRPCNodeApi<Node extends AnyRPCNode>(): RPCNodeApi<Node> {
  throw new Error("Not implemented");
}

export type RPCNodeApi<Node extends AnyRPCNode> = Node extends AnyRouterNode
  ? RouterApi<Node>
  : Node extends AnyQueryNode
    ? QueryApi<Node>
    : Node extends AnyMutationNode
      ? MutationApi<Node>
      : never;

export type RouterApi<Router extends AnyRouterNode> = {
  [K in keyof Router["routes"]]: RPCNodeApi<Router["routes"][K]>;
};

export interface QueryApiOptions<Input, Output, MappedOutput> {
  input: Input | SkipToken;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
}

export interface QueryApi<Node extends AnyQueryNode> {
  createQuery: <MappedOutput = inferOutput<Node["handler"]>>(
    options?: () => QueryApiOptions<
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

export interface MutationApi<Node extends AnyMutationNode> {
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

type inferInput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer C, infer I, infer O, infer MW> ? I : never;

type inferOutput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer C, infer I, infer O, infer MW> ? O : never;
