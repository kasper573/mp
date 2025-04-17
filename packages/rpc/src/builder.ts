/* eslint-disable @typescript-eslint/no-explicit-any */

export class RpcBuilder<Context> {
  context<Context>() {
    return new RpcBuilder<Context>();
  }

  build(): RpcFactories<Context> {
    return {
      router: (routes) => ({ type: "router", routes }),
      procedure: ProcedureBuilder.create<Context>(),
      middleware: createMiddleware,
    };
  }
}

function createMiddleware<Context, MWContext, PipedMWContext>(
  handler: RpcMiddlewareHandler<Context, MWContext, PipedMWContext>,
): RpcMiddleware<Context, MWContext, PipedMWContext> {
  function middleware(...args: Parameters<typeof handler>) {
    return handler(...args);
  }

  const pipe: MiddlewareBuilder<Context, MWContext> = (nextHandler) =>
    createMiddleware(async (opt) => {
      const mwc = await handler(opt as never);
      return nextHandler({ ...opt, mwc });
    });

  middleware.pipe = pipe;

  return middleware;
}

export interface RpcFactories<Context> {
  router: RouterBuilder;
  procedure: ProcedureBuilder<void, void, Context, unknown>;
  middleware: MiddlewareBuilder<Context, unknown>;
}

export interface RouterBuilder {
  <Routes extends AnyRouteRecord>(routes: Routes): RouterNode<Routes>;
}

export interface MiddlewareBuilder<Context, PipedMWContext> {
  <MWContext>(
    middlewareFn: RpcMiddlewareHandler<Context, MWContext, PipedMWContext>,
  ): RpcMiddleware<Context, MWContext, PipedMWContext>;
}

interface RpcNode<Type extends string> {
  type: Type;
}

export type ProcedureHandler<Input, Output, Context, MWContext> = (
  opt: ProcedureHandlerOptions<Input, Context, MWContext>,
) => ProcedureResult<Output>;

type ProcedureResult<Output> = Output | Promise<Output>;

interface ProcedureHandlerOptions<Input, Context, MWContext> {
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

export interface QueryNode<Input, Output, Context, MWContext>
  extends RpcNode<"query"> {
  handler: ProcedureHandler<Input, Output, Context, MWContext>;
}

export interface MutationNode<Input, Output, Context, MWContext>
  extends RpcNode<"mutation"> {
  handler: ProcedureHandler<Input, Output, Context, MWContext>;
}

export interface RouterNode<Routes extends AnyRouteRecord>
  extends RpcNode<"router"> {
  routes: Routes;
}

export type AnyMutationNode<Context = any> = MutationNode<
  any,
  any,
  Context,
  any
>;
export type AnyQueryNode<Context = any> = QueryNode<any, any, Context, any>;
export type AnyProcedureNode<Context = any> =
  | AnyMutationNode<Context>
  | AnyQueryNode<Context>;
export type AnyRouterNode<Context = any> = RouterNode<AnyRouteRecord<Context>>;
export type AnyRpcNode<Context = any> =
  | AnyProcedureNode<Context>
  | AnyRouterNode<Context>;
export type AnyRouteRecord<Context = any> = Record<string, AnyRpcNode<Context>>;

export class ProcedureBuilder<Input, Output, Context, MWContext> {
  private constructor(
    private middleware: RpcMiddleware<Context, MWContext, unknown>,
  ) {}

  use<NewMWContext, PipedMWContext>(
    middleware: RpcMiddleware<Context, NewMWContext, PipedMWContext>,
  ): ProcedureBuilder<Input, Output, Context, NewMWContext> {
    return new ProcedureBuilder(
      this.middleware.pipe(middleware as never) as never,
    );
  }
  input<NewInput>(): ProcedureBuilder<NewInput, Output, Context, MWContext> {
    return new ProcedureBuilder(this.middleware);
  }
  output<NewOutput>(): ProcedureBuilder<Input, NewOutput, Context, MWContext> {
    return new ProcedureBuilder(this.middleware);
  }

  query(
    handler: ProcedureHandler<Input, Output, Context, MWContext>,
  ): QueryNode<Input, Output, Context, MWContext> {
    return { type: "query", handler };
  }

  mutation(
    handler: ProcedureHandler<Input, Output, Context, MWContext>,
  ): MutationNode<Input, Output, Context, MWContext> {
    return { type: "mutation", handler };
  }

  static create<Context>(): ProcedureBuilder<void, void, Context, unknown> {
    return new ProcedureBuilder(
      createMiddleware<Context, unknown, unknown>(() => {}),
    );
  }
}

export interface RpcMiddlewareHandler<Context, MWContext, PipedMWContext> {
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

export interface RpcMiddleware<Context, MWContext, PipedMWContext>
  extends RpcMiddlewareHandler<Context, MWContext, PipedMWContext> {
  pipe: MiddlewareBuilder<Context, MWContext>;
}

export type RpcErrorFormatter<Context> = (opt: {
  ctx: Context;
  error: RpcError;
}) => RpcError;

export class RpcError extends Error {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args);
    this.name = "RpcError";
  }
}
