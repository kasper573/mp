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

  const pipe: EventMiddlewareBuilder<Context, MwContext> = (nextHandler) =>
    createMiddleware(async (opt) => {
      const mwc = await handler(opt as never);
      return nextHandler({ ...opt, mwc });
    });

  middleware.pipe = pipe;

  return middleware;
}

export interface EventRouterFactories<Context> {
  router: EventRouterFactory;
  event: EventBuilder<void, Context, unknown>;
  middleware: EventMiddlewareBuilder<Context, unknown>;
}

export type EventRouterFactory = <Routes extends AnyEventNodeRecord>(
  routes: Routes,
) => EventRouterNode<Routes>;

export type EventMiddlewareBuilder<Context, PipedMwContext> = <MwContext>(
  middlewareFn: EventRouterMiddlewareHandler<
    Context,
    MwContext,
    PipedMwContext
  >,
) => EventRouterMiddleware<Context, MwContext, PipedMwContext>;

export type EventRouterHandler<Input, Context, MwContext> = (
  opt: EventHandlerOptions<Input, Context, MwContext>,
) => void;

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

export interface EventRouterHandlerNode<Input, Context, MwContext> {
  type: "handler";
  handler: EventRouterHandler<Input, Context, MwContext>;
}

export interface EventRouterNode<Routes extends AnyEventNodeRecord> {
  type: "router";
  routes: Routes;
}

export type AnyEventRouterHandlerNode<Context = any> = EventRouterHandlerNode<
  any,
  Context,
  any
>;
export type AnyEventRouterNode<Context = any> = EventRouterNode<
  AnyEventNodeRecord<Context>
>;
export type AnyEventNode<Context = any> =
  | AnyEventRouterHandlerNode<Context>
  | AnyEventRouterNode<Context>;
export type AnyEventNodeRecord<Context = any> = Record<
  string,
  AnyEventNode<Context>
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
    handler: EventRouterHandler<Input, Context, MwContext>,
  ): EventRouterHandlerNode<Input, Context, MwContext> {
    return {
      type: "handler",
      handler: this.pipeMiddlewareIntoHandler(handler),
    };
  }

  private pipeMiddlewareIntoHandler(
    handler: EventRouterHandler<Input, Context, MwContext>,
  ): EventRouterHandler<Input, Context, MwContext> {
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
  pipe: EventMiddlewareBuilder<Context, MwContext>;
}

export type InferEventInput<T extends AnyEventRouterHandlerNode["handler"]> =
  T extends EventRouterHandler<infer I, infer _C, infer _MW> ? I : never;

export type InferEventContext<T extends AnyEventNode> =
  T extends AnyEventNode<infer C> ? C : never;
