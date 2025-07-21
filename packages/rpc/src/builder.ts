// oxlint-disable no-explicit-any
export class RpcBuilder<Context = void> {
  context<Context>() {
    return new RpcBuilder<Context>();
  }

  build(): RpcFactories<Context> {
    return {
      router: (routes) => ({ type: "router", routes }),
      procedure: RpcProcedureBuilder.create<Context>(),
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

  const pipe: RpcMiddlewareBuilder<Context, MwContext> = (nextHandler) =>
    createMiddleware(async (opt) => {
      const mwc = await handler(opt as never);
      return nextHandler({ ...opt, mwc });
    });

  middleware.pipe = pipe;

  return middleware;
}

export interface RpcFactories<Context> {
  router: RpcRouterBuilder;
  procedure: RpcProcedureBuilder<void, void, Context, unknown>;
  middleware: RpcMiddlewareBuilder<Context, unknown>;
}

export type RpcRouterBuilder = <Routes extends AnyRpcRouteRecord>(
  routes: Routes,
) => RpcRouterNode<Routes>;

export type RpcMiddlewareBuilder<Context, PipedMwContext> = <MwContext>(
  middlewareFn: RpcMiddlewareHandler<Context, MwContext, PipedMwContext>,
) => RpcMiddleware<Context, MwContext, PipedMwContext>;

interface RpcNode<Type extends string> {
  type: Type;
}

export type RpcProcedureHandler<Input, Output, Context, MwContext> = (
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

export interface RpcQueryNode<Input, Output, Context, MwContext>
  extends RpcNode<"query"> {
  handler: RpcProcedureHandler<Input, Output, Context, MwContext>;
}

export interface RpcMutationNode<Input, Output, Context, MwContext>
  extends RpcNode<"mutation"> {
  handler: RpcProcedureHandler<Input, Output, Context, MwContext>;
}

export interface RpcRouterNode<Routes extends AnyRpcRouteRecord>
  extends RpcNode<"router"> {
  routes: Routes;
}

export type AnyRpcMutationNode<Context = any> = RpcMutationNode<
  any,
  any,
  Context,
  any
>;
export type AnyRpcQueryNode<Context = any> = RpcQueryNode<
  any,
  any,
  Context,
  any
>;
export type AnyRpcProcedureNode<Context = any> =
  | AnyRpcMutationNode<Context>
  | AnyRpcQueryNode<Context>;
export type AnyRpcRouterNode<Context = any> = RpcRouterNode<
  AnyRpcRouteRecord<Context>
>;
export type AnyRpcNode<Context = any> =
  | AnyRpcProcedureNode<Context>
  | AnyRpcRouterNode<Context>;
export type AnyRpcRouteRecord<Context = any> = Record<
  string,
  AnyRpcNode<Context>
>;

export class RpcProcedureBuilder<Input, Output, Context, MwContext> {
  private constructor(
    private middleware: RpcMiddleware<Context, MwContext, unknown>,
  ) {}

  use<NewMwContext, PipedMwContext>(
    middleware: RpcMiddleware<Context, NewMwContext, PipedMwContext>,
  ): RpcProcedureBuilder<Input, Output, Context, NewMwContext> {
    return new RpcProcedureBuilder(
      this.middleware.pipe(middleware as never) as never,
    );
  }
  input<NewInput>(): RpcProcedureBuilder<NewInput, Output, Context, MwContext> {
    return new RpcProcedureBuilder(this.middleware);
  }
  output<NewOutput>(): RpcProcedureBuilder<
    Input,
    NewOutput,
    Context,
    MwContext
  > {
    return new RpcProcedureBuilder(this.middleware);
  }

  query(
    handler: RpcProcedureHandler<Input, Output, Context, MwContext>,
  ): RpcQueryNode<Input, Output, Context, MwContext> {
    return {
      type: "query",
      handler: this.pipeMiddlewareIntoHandler(handler),
    };
  }

  mutation(
    handler: RpcProcedureHandler<Input, Output, Context, MwContext>,
  ): RpcMutationNode<Input, Output, Context, MwContext> {
    return {
      type: "mutation",
      handler: this.pipeMiddlewareIntoHandler(handler),
    };
  }

  private pipeMiddlewareIntoHandler(
    handler: RpcProcedureHandler<Input, Output, Context, MwContext>,
  ): RpcProcedureHandler<Input, Output, Context, MwContext> {
    return async (opt) => {
      const mwc = await this.middleware(opt);
      return handler({ ...opt, mwc });
    };
  }

  static create<Context>(): RpcProcedureBuilder<void, void, Context, unknown> {
    return new RpcProcedureBuilder(
      createMiddleware<Context, unknown, unknown>(() => {}),
    );
  }
}

export type RpcMiddlewareHandler<Context, MwContext, PipedMwContext> = (opt: {
  /**
   * The global rpc context
   */
  ctx: Context;
  /**
   * The middleware context output by the piped middleware (if any)
   */
  mwc: PipedMwContext;
}) => ProcedureResult<MwContext>;

export interface RpcMiddleware<Context, MwContext, PipedMwContext>
  extends RpcMiddlewareHandler<Context, MwContext, PipedMwContext> {
  pipe: RpcMiddlewareBuilder<Context, MwContext>;
}

export type InferRpcInput<T extends AnyRpcProcedureNode["handler"]> =
  T extends RpcProcedureHandler<infer I, infer _O, infer _C, infer _MW>
    ? I
    : never;

export type InferRpcOutput<T extends AnyRpcProcedureNode["handler"]> =
  T extends RpcProcedureHandler<infer _I, infer O, infer _C, infer _MW>
    ? O
    : never;

export type InferRpcContext<T extends AnyRpcNode> =
  T extends AnyRpcNode<infer C> ? C : never;
