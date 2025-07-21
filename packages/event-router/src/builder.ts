// oxlint-disable no-explicit-any
export class EventRouterBuilder<Context = void> {
  context<Context>() {
    return new EventRouterBuilder<Context>();
  }

  build(): EventRouterFactories<Context> {
    return {
      router: (routes) => ({ type: "router", routes }),
      event: EventBuilder.create<Context>(),
      middleware: createMiddleware,
    };
  }
}

function createMiddleware<Context, MwContext, PipedMwContext>(
  handler: EventRouterMiddlewareHandler<Context, MwContext, PipedMwContext>,
): EventRouterMiddleware<Context, MwContext, PipedMwContext> {
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

export interface EventRouterFactories<Context> {
  router: RouterBuilder;
  event: EventBuilder<void, Context, unknown>;
  middleware: MiddlewareBuilder<Context, unknown>;
}

export type RouterBuilder = <Routes extends AnyRouteRecord>(
  routes: Routes,
) => RouterNode<Routes>;

export type MiddlewareBuilder<Context, PipedMwContext> = <MwContext>(
  middlewareFn: EventRouterMiddlewareHandler<
    Context,
    MwContext,
    PipedMwContext
  >,
) => EventRouterMiddleware<Context, MwContext, PipedMwContext>;

interface EventRouterNode<Type extends string> {
  type: Type;
}

export type EventHandler<Input, Context, MwContext> = (
  opt: EventHandlerOptions<Input, Context, MwContext>,
) => void | Promise<void>;

interface EventHandlerOptions<Input, Context, MwContext> {
  /**
   * The global eventrouter context
   */
  ctx: Context;
  /**
   * The final context output by th middleware chain
   */
  mwc: MwContext;
  input: Input;
}

export interface QueryNode<Input, Context, MwContext>
  extends EventRouterNode<"query"> {
  handler: EventHandler<Input, Context, MwContext>;
}

export interface MutationNode<Input, Context, MwContext>
  extends EventRouterNode<"mutation"> {
  handler: EventHandler<Input, Context, MwContext>;
}

export interface RouterNode<Routes extends AnyRouteRecord>
  extends EventRouterNode<"router"> {
  routes: Routes;
}

export type AnyMutationNode<Context = any> = MutationNode<any, Context, any>;
export type AnyQueryNode<Context = any> = QueryNode<any, Context, any>;
export type AnyEventNode<Context = any> =
  | AnyMutationNode<Context>
  | AnyQueryNode<Context>;
export type AnyRouterNode<Context = any> = RouterNode<AnyRouteRecord<Context>>;
export type AnyEventRouterNode<Context = any> =
  | AnyEventNode<Context>
  | AnyRouterNode<Context>;
export type AnyRouteRecord<Context = any> = Record<
  string,
  AnyEventRouterNode<Context>
>;

export class EventBuilder<Input, Context, MwContext> {
  private constructor(
    private middleware: EventRouterMiddleware<Context, MwContext, unknown>,
  ) {}

  use<NewMwContext, PipedMwContext>(
    middleware: EventRouterMiddleware<Context, NewMwContext, PipedMwContext>,
  ): EventBuilder<Input, Context, NewMwContext> {
    return new EventBuilder(this.middleware.pipe(middleware as never) as never);
  }
  input<NewInput>(): EventBuilder<NewInput, Context, MwContext> {
    return new EventBuilder(this.middleware);
  }

  handler(
    handler: EventHandler<Input, Context, MwContext>,
  ): QueryNode<Input, Context, MwContext> {
    return {
      type: "query",
      handler: this.pipeMiddlewareIntoHandler(handler),
    };
  }

  private pipeMiddlewareIntoHandler(
    handler: EventHandler<Input, Context, MwContext>,
  ): EventHandler<Input, Context, MwContext> {
    return async (opt) => {
      const mwc = await this.middleware(opt);
      return handler({ ...opt, mwc });
    };
  }

  static create<Context>(): EventBuilder<void, Context, unknown> {
    return new EventBuilder(
      createMiddleware<Context, unknown, unknown>(() => {}),
    );
  }
}

export type EventRouterMiddlewareHandler<Context, MwContext, PipedMwContext> =
  (opt: {
    /**
     * The global eventrouter context
     */
    ctx: Context;
    /**
     * The middleware context output by the piped middleware (if any)
     */
    mwc: PipedMwContext;
  }) => MwContext | Promise<MwContext>;

export interface EventRouterMiddleware<Context, MwContext, PipedMwContext>
  extends EventRouterMiddlewareHandler<Context, MwContext, PipedMwContext> {
  pipe: MiddlewareBuilder<Context, MwContext>;
}

export type InferInput<T extends AnyEventNode["handler"]> =
  T extends EventHandler<infer I, infer _C, infer _MW> ? I : never;

export type InferContext<T extends AnyEventRouterNode> =
  T extends AnyEventRouterNode<infer C> ? C : never;
