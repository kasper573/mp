/* eslint-disable @typescript-eslint/no-explicit-any */

export class RpcBuilder<Context = void, RpcHeaders = void> {
  context<NewContext>() {
    return new RpcBuilder<NewContext, RpcHeaders>();
  }

  headers<NewHeaders>() {
    return new RpcBuilder<Context, NewHeaders>();
  }

  build(): RpcFactories<Context, RpcHeaders> {
    return {
      router: (routes) => ({ type: "router", routes }),
      procedure: ProcedureBuilder.create<Context, RpcHeaders>(),
      middleware: createMiddleware,
    };
  }
}

function createMiddleware<Context, MwContext, PipedMwContext, RpcHeaders>(
  handler: RpcMiddlewareHandler<Context, MwContext, PipedMwContext, RpcHeaders>,
): RpcMiddleware<Context, MwContext, PipedMwContext, RpcHeaders> {
  function middleware(...args: Parameters<typeof handler>) {
    return handler(...args);
  }

  const pipe: MiddlewareBuilder<Context, MwContext, RpcHeaders> = (
    nextHandler,
  ) =>
    createMiddleware(async (opt) => {
      const mwc = await handler(opt as never);
      return nextHandler({ ...opt, mwc });
    });

  middleware.pipe = pipe;

  return middleware;
}

export interface RpcFactories<Context, RpcHeaders> {
  router: RouterBuilder;
  procedure: ProcedureBuilder<void, void, Context, unknown, RpcHeaders>;
  middleware: MiddlewareBuilder<Context, unknown, RpcHeaders>;
}

export interface RouterBuilder {
  <Routes extends AnyRouteRecord>(routes: Routes): RouterNode<Routes>;
}

export interface MiddlewareBuilder<Context, PipedMwContext, RpcHeaders> {
  <MwContext>(
    middlewareFn: RpcMiddlewareHandler<
      Context,
      MwContext,
      PipedMwContext,
      RpcHeaders
    >,
  ): RpcMiddleware<Context, MwContext, PipedMwContext, RpcHeaders>;
}

interface RpcNode<Type extends string> {
  type: Type;
}

export type ProcedureHandler<Input, Output, Context, MwContext, RpcHeaders> = (
  opt: ProcedureHandlerOptions<Input, Context, MwContext, RpcHeaders>,
) => ProcedureResult<Output>;

type ProcedureResult<Output> = Output | Promise<Output>;

interface ProcedureHandlerOptions<Input, Context, MwContext, RpcHeaders> {
  /**
   * The global rpc context
   */
  ctx: Context;
  /**
   * The final context output by th middleware chain
   */
  mwc: MwContext;
  input: Input;
  headers: RpcHeaders;
}

export interface QueryNode<Input, Output, Context, MwContext, RpcHeaders>
  extends RpcNode<"query"> {
  handler: ProcedureHandler<Input, Output, Context, MwContext, RpcHeaders>;
}

export interface MutationNode<Input, Output, Context, MwContext, RpcHeaders>
  extends RpcNode<"mutation"> {
  handler: ProcedureHandler<Input, Output, Context, MwContext, RpcHeaders>;
}

export interface RouterNode<Routes extends AnyRouteRecord>
  extends RpcNode<"router"> {
  routes: Routes;
}

export type AnyMutationNode<Context = any> = MutationNode<
  any,
  any,
  Context,
  any,
  any
>;
export type AnyQueryNode<Context = any> = QueryNode<
  any,
  any,
  Context,
  any,
  any
>;
export type AnyProcedureNode<Context = any> =
  | AnyMutationNode<Context>
  | AnyQueryNode<Context>;
export type AnyRouterNode<Context = any> = RouterNode<AnyRouteRecord<Context>>;
export type AnyRpcNode<Context = any> =
  | AnyProcedureNode<Context>
  | AnyRouterNode<Context>;
export type AnyRouteRecord<Context = any> = Record<string, AnyRpcNode<Context>>;

export class ProcedureBuilder<Input, Output, Context, MwContext, RpcHeaders> {
  private constructor(
    private middleware: RpcMiddleware<Context, MwContext, unknown, RpcHeaders>,
  ) {}

  use<NewMwContext, PipedMwContext>(
    middleware: RpcMiddleware<
      Context,
      NewMwContext,
      PipedMwContext,
      RpcHeaders
    >,
  ): ProcedureBuilder<Input, Output, Context, NewMwContext, RpcHeaders> {
    return new ProcedureBuilder(
      this.middleware.pipe(middleware as never) as never,
    );
  }
  input<NewInput>(): ProcedureBuilder<
    NewInput,
    Output,
    Context,
    MwContext,
    RpcHeaders
  > {
    return new ProcedureBuilder(this.middleware);
  }
  output<NewOutput>(): ProcedureBuilder<
    Input,
    NewOutput,
    Context,
    MwContext,
    RpcHeaders
  > {
    return new ProcedureBuilder(this.middleware);
  }

  query(
    handler: ProcedureHandler<Input, Output, Context, MwContext, RpcHeaders>,
  ): QueryNode<Input, Output, Context, MwContext, RpcHeaders> {
    return {
      type: "query",
      handler: this.pipeMiddlewareIntoHandler(handler),
    };
  }

  mutation(
    handler: ProcedureHandler<Input, Output, Context, MwContext, RpcHeaders>,
  ): MutationNode<Input, Output, Context, MwContext, RpcHeaders> {
    return {
      type: "mutation",
      handler: this.pipeMiddlewareIntoHandler(handler),
    };
  }

  private pipeMiddlewareIntoHandler(
    handler: ProcedureHandler<Input, Output, Context, MwContext, RpcHeaders>,
  ): ProcedureHandler<Input, Output, Context, MwContext, RpcHeaders> {
    return async (opt) => {
      const mwc = await this.middleware(opt);
      return handler({ ...opt, mwc });
    };
  }

  static create<Context, RpcHeaders>(): ProcedureBuilder<
    void,
    void,
    Context,
    unknown,
    RpcHeaders
  > {
    return new ProcedureBuilder(
      createMiddleware<Context, unknown, unknown, RpcHeaders>(() => {}),
    );
  }
}

export interface RpcMiddlewareHandler<
  Context,
  MwContext,
  PipedMwContext,
  RpcHeaders,
> {
  (opt: {
    /**
     * The global rpc context
     */
    ctx: Context;
    /**
     * The middleware context output by the piped middleware (if any)
     */
    mwc: PipedMwContext;
    /**
     * The headers for the rpc call
     */
    headers: RpcHeaders;
  }): ProcedureResult<MwContext>;
}

export interface RpcMiddleware<Context, MwContext, PipedMwContext, RpcHeaders>
  extends RpcMiddlewareHandler<Context, MwContext, PipedMwContext, RpcHeaders> {
  pipe: MiddlewareBuilder<Context, MwContext, RpcHeaders>;
}

export type InferInput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer I, infer O, infer C, infer MW, infer H>
    ? I
    : never;

export type InferOutput<T extends AnyProcedureNode["handler"]> =
  T extends ProcedureHandler<infer I, infer O, infer C, infer MW, infer H>
    ? O
    : never;

export type InferContext<T extends AnyRpcNode> =
  T extends AnyRpcNode<infer C> ? C : never;
