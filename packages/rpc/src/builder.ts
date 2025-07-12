export class RpcBuilder<Context = void> {
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

function createMiddleware<Context, MwContext, PipedMwContext>(
  handler: RpcMiddlewareHandler<Context, MwContext, PipedMwContext>,
): RpcMiddleware<Context, MwContext, PipedMwContext> {
  function middleware(...args: Parameters<typeof handler>) {
    return handler(...args);
  }

  const pipe: MiddlewareBuilder<Context, MwContext> = (nextHandler) =>
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

export interface MiddlewareBuilder<Context, PipedMwContext> {
  <MwContext>(
    middlewareFn: RpcMiddlewareHandler<Context, MwContext, PipedMwContext>,
  ): RpcMiddleware<Context, MwContext, PipedMwContext>;
}

interface RpcNode<Type extends string> {
  type: Type;
}

export type ProcedureHandler<Input, Output, Context, MwContext> = (
  opt: ProcedureHandlerOptions<Input, Context, MwContext>,
) => ProcedureResult<Output>;

type ProcedureResult<Output> = Output | Promise<Output>;

interface ProcedureHandlerOptions<Input, Context, MwContext> {
  /**
   * The global rpc context
   */
  ctx: Context;
  /**
   * The final context output by th middleware chain
   */
  mwc: MwContext;
  input: Input;
}

export interface QueryNode<Input, Output, Context, MwContext>
  extends RpcNode<"query"> {
  handler: ProcedureHandler<Input, Output, Context, MwContext>;
}

export interface MutationNode<Input, Output, Context, MwContext>
  extends RpcNode<"mutation"> {
  handler: ProcedureHandler<Input, Output, Context, MwContext>;
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

export class ProcedureBuilder<Input, Output, Context, MwContext> {
  private constructor(
    private middleware: RpcMiddleware<Context, MwContext, unknown>,
  ) {}

  use<NewMwContext, PipedMwContext>(
    middleware: RpcMiddleware<Context, NewMwContext, PipedMwContext>,
  ): ProcedureBuilder<Input, Output, Context, NewMwContext> {
    return new ProcedureBuilder(
      this.middleware.pipe(middleware as never) as never,
    );
  }
  input<NewInput>(): ProcedureBuilder<NewInput, Output, Context, MwContext> {
    return new ProcedureBuilder(this.middleware);
  }
  output<NewOutput>(): ProcedureBuilder<Input, NewOutput, Context, MwContext> {
    return new ProcedureBuilder(this.middleware);
  }

  query(
    handler: ProcedureHandler<Input, Output, Context, MwContext>,
  ): QueryNode<Input, Output, Context, MwContext> {
    return {
      type: "query",
      handler: this.pipeMiddlewareIntoHandler(handler),
    };
  }

  mutation(
    handler: ProcedureHandler<Input, Output, Context, MwContext>,
  ): MutationNode<Input, Output, Context, MwContext> {
    return {
      type: "mutation",
      handler: this.pipeMiddlewareIntoHandler(handler),
    };
  }

  private pipeMiddlewareIntoHandler(
    handler: ProcedureHandler<Input, Output, Context, MwContext>,
  ): ProcedureHandler<Input, Output, Context, MwContext> {
    return async (opt) => {
      const mwc = await this.middleware(opt);
      return handler({ ...opt, mwc });
    };
  }

  static create<Context>(): ProcedureBuilder<void, void, Context, unknown> {
    return new ProcedureBuilder(
      createMiddleware<Context, unknown, unknown>(() => {}),
    );
  }
}

export interface RpcMiddlewareHandler<Context, MwContext, PipedMwContext> {
  (opt: {
    /**
     * The global rpc context
     */
    ctx: Context;
    /**
     * The middleware context output by the piped middleware (if any)
     */
    mwc: PipedMwContext;
  }): ProcedureResult<MwContext>;
}

export interface RpcMiddleware<Context, MwContext, PipedMwContext>
  extends RpcMiddlewareHandler<Context, MwContext, PipedMwContext> {
  pipe: MiddlewareBuilder<Context, MwContext>;
}

export type InferInput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer I, infer _, infer _, infer _> ? I : never;

export type InferOutput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer _, infer O, infer _, infer _> ? O : never;

export type InferContext<T extends AnyRpcNode> =
  T extends AnyRpcNode<infer C> ? C : never;
