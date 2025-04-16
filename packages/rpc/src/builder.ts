/* eslint-disable @typescript-eslint/no-explicit-any */

export class RPCBuilder<Context> {
  context<Context>() {
    return new RPCBuilder<Context>();
  }

  build(): RPCFactories<Context> {
    return {
      router: (routes) => ({ type: "router", routes }),
      procedure: new ProcedureBuilder(),
      middleware: createMiddleware,
    };
  }
}

function createMiddleware<Context, MWContext, PipedMWContext>(
  handler: RPCMiddlewareHandler<Context, MWContext, PipedMWContext>,
): RPCMiddleware<Context, MWContext, PipedMWContext> {
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

export interface RPCFactories<Context> {
  router: RouterBuilder;
  procedure: ProcedureBuilder<void, void, Context, unknown>;
  middleware: MiddlewareBuilder<Context, unknown>;
}

export interface RouterBuilder {
  <Routes extends AnyRouteRecord>(routes: Routes): RouterNode<Routes>;
}

export interface MiddlewareBuilder<Context, PipedMWContext> {
  <MWContext>(
    middlewareFn: RPCMiddlewareHandler<Context, MWContext, PipedMWContext>,
  ): RPCMiddleware<Context, MWContext, PipedMWContext>;
}

interface RPCNode<Type extends string> {
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
  extends RPCNode<"query"> {
  handler: ProcedureHandler<Input, Output, Context, MWContext>;
}

export interface MutationNode<Input, Output, Context, MWContext>
  extends RPCNode<"mutation"> {
  handler: ProcedureHandler<Input, Output, Context, MWContext>;
}

export interface RouterNode<Routes extends AnyRouteRecord>
  extends RPCNode<"router"> {
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
export type AnyRPCNode<Context = any> =
  | AnyProcedureNode<Context>
  | AnyRouterNode<Context>;
export type AnyRouteRecord<Context = any> = Record<string, AnyRPCNode<Context>>;

export class ProcedureBuilder<Input, Output, Context, MWContext> {
  use<NewMWContext, PipedMWContext>(
    middleware: RPCMiddleware<Context, NewMWContext, PipedMWContext>,
  ): ProcedureBuilder<Input, Output, Context, NewMWContext> {
    throw new Error("Not implemented");
  }
  input<NewInput>(): ProcedureBuilder<NewInput, Output, Context, MWContext> {
    throw new Error("Not implemented");
  }
  output<NewOutput>(): ProcedureBuilder<Input, NewOutput, Context, MWContext> {
    throw new Error("Not implemented");
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
}

export interface RPCMiddlewareHandler<Context, MWContext, PipedMWContext> {
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
  extends RPCMiddlewareHandler<Context, MWContext, PipedMWContext> {
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
