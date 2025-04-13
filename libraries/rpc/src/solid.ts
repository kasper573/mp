import type {
  AnyMutationNode,
  AnyProcedureNode,
  AnyQueryNode,
  AnyRouterNode,
  AnyRPCNode,
  ProcedureHandler,
  RPCError,
} from "./builder";

export type RPCNodeHook<Node extends AnyRPCNode> = Node extends AnyRouterNode
  ? RouterHook<Node>
  : Node extends AnyQueryNode
    ? QueryHook<Node>
    : Node extends AnyMutationNode
      ? MutationHook<Node>
      : never;

export type RouterHook<Router extends AnyRouterNode> = {
  [K in keyof Router["routes"]]: RPCNodeHook<Router["routes"][K]>;
};

export interface QueryHookOptions<Input, Output, MappedOutput> {
  input: Input | SkipToken;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
}

export interface QueryHook<Node extends AnyQueryNode> {
  createQuery: <MappedOutput = inferOutput<Node["handler"]>>(
    options?: () => QueryHookOptions<
      inferInput<Node["handler"]>,
      inferOutput<Node["handler"]>,
      MappedOutput
    >,
  ) => QueryLike<MappedOutput>;
}

export interface QueryLike<Output> {
  data?: Output;
  error?: RPCError;
  isLoading: boolean;
  refetch: () => void;
}

export interface MutationHook<Node extends AnyMutationNode> {
  createMutation: () => MutationLike<
    inferInput<Node["handler"]>,
    inferOutput<Node["handler"]>
  >;
}

export interface MutationLike<Input, Output> {
  mutate: (input: Input) => void;
  mutateAsync: (input: Input) => Promise<Output>;
}

export function createRPCHook<Node extends AnyRPCNode>(
  node?: Node,
): () => RPCNodeHook<Node> {
  throw new Error("Not implemented");
}

export type SkipToken = typeof skipToken;
export const skipToken = Symbol("skipToken");

type inferInput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer C, infer I, infer O, infer MW> ? I : never;

type inferOutput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer C, infer I, infer O, infer MW> ? O : never;
