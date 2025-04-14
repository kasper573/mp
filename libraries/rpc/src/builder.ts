/* eslint-disable @typescript-eslint/no-explicit-any */
export class RPCBuilder<Context> {
  context<Context>() {
    return new RPCBuilder<Context>();
  }

  build(): RPCFactories<Context> {
    return {
      router: () => ({}),
      procedure: () => ({}),
      middleware: () => ({}),
    };
  }
}

export interface RPCFactories<Context> {
  router: RouterBuilder;
  procedure: ProcedureBuilder<Context, void, void, unknown>;
  middleware: MiddlewareBuilder<Context, unknown>;
}

export interface RouterBuilder {
  <Routes extends AnyRouteRecord>(routes: Routes): RouterNode<Routes>;
}

export interface MiddlewareBuilder<Context, PipedMWContext> {
  <MWContext>(
    middlewareFn: RPCMiddlewareFn<Context, MWContext, PipedMWContext>,
  ): RPCMiddleware<Context, MWContext, PipedMWContext>;
}

interface RPCNode<Type extends string> {
  type: Type;
}

export type ProcedureHandler<Context, Input, Output, MWContext> = (
  opt: ProcedureHandlerOptions<Context, Input, MWContext>,
) => ProcedureResult<Output>;

type ProcedureResult<Output> = Output | Promise<Output>;

interface ProcedureHandlerOptions<Context, Input, MWContext> {
  /**
   * The global rpc context
   */
  ctx: Context;
  /**
   * The final context output by th middleware chain
   */
  mwc: MWContext;
  input: Input;
}

interface QueryNode<Context, Input, Output, MWContext>
  extends RPCNode<"query"> {
  handler: ProcedureHandler<Context, Input, Output, MWContext>;
}

interface MutationNode<Context, Input, Output, MWContext>
  extends RPCNode<"mutation"> {
  handler: ProcedureHandler<Context, Input, Output, MWContext>;
}

interface RouterNode<Routes extends AnyRouteRecord> extends RPCNode<"router"> {
  routes: Routes;
}

export type AnyMutationNode<Context = any> = MutationNode<
  Context,
  any,
  any,
  any
>;
export type AnyQueryNode<Context = any> = QueryNode<Context, any, any, any>;
export type AnyProcedureNode<Context = any> =
  | AnyMutationNode<Context>
  | AnyQueryNode<Context>;
export type AnyRouterNode<Context = any> = RouterNode<AnyRouteRecord<Context>>;
export type AnyRPCNode<Context = any> =
  | AnyProcedureNode<Context>
  | AnyRouterNode<Context>;
export type AnyRouteRecord<Context = any> = Record<string, AnyRPCNode<Context>>;

export interface ProcedureBuilder<Context, Input, Output, MWContext> {
  use: <NewMWContext, PipedMWContext>(
    middleware: RPCMiddleware<Context, NewMWContext, PipedMWContext>,
  ) => ProcedureBuilder<Context, Input, Output, NewMWContext>;
  input: <NewInput>() => ProcedureBuilder<Context, NewInput, Output, MWContext>;
  output: <NewOutput>() => ProcedureBuilder<
    Context,
    Input,
    NewOutput,
    MWContext
  >;

  query: (
    handler: ProcedureHandler<Context, Input, Output, MWContext>,
  ) => QueryNode<Context, Input, Output, MWContext>;

  mutation: (
    handler: ProcedureHandler<Context, Input, Output, MWContext>,
  ) => MutationNode<Context, Input, Output, MWContext>;
}

export interface RPCMiddlewareFn<Context, MWContext, PipedMWContext> {
  (opt: {
    /**
     * The global rpc context
     */
    ctx: Context;
    /**
     * The middleware context output by the piped middleware (if any)
     */
    mwc: PipedMWContext;
  }): ProcedureResult<MWContext>;
}

export interface RPCMiddleware<Context, MWContext, PipedMWContext>
  extends RPCMiddlewareFn<Context, MWContext, PipedMWContext> {
  pipe: MiddlewareBuilder<Context, MWContext>;
}

export type RPCErrorFormatter<Context> = (opt: {
  ctx: Context;
  error: RPCError;
}) => RPCError;

export class RPCError extends Error {
  constructor(opt: { code: string; message: string }) {
    super(`${opt.code}: ${opt.message}`);
    this.name = "RPCError";
  }
}
