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
  handler: EventMiddlewareHandler<Context, MwContext, PipedMwContext>,
): EventMiddleware<Context, MwContext, PipedMwContext> {
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
) => RouterNode<Routes>;

export type EventMiddlewareBuilder<Context, PipedMwContext> = <MwContext>(
  middlewareFn: EventMiddlewareHandler<Context, MwContext, PipedMwContext>,
) => EventMiddleware<Context, MwContext, PipedMwContext>;

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

export interface HandlerNode<Input, Context, MwContext> {
  type: "handler";
  handler: EventHandler<Input, Context, MwContext>;
}

export interface RouterNode<Routes extends AnyEventNodeRecord> {
  type: "router";
  routes: Routes;
}

export type AnyHandlerNode<Context = any> = HandlerNode<any, Context, any>;
export type AnyRouterNode<Context = any> = RouterNode<
  AnyEventNodeRecord<Context>
>;
export type AnyEventNode<Context = any> =
  | AnyHandlerNode<Context>
  | AnyRouterNode<Context>;
export type AnyEventNodeRecord<Context = any> = Record<
  string,
  AnyEventNode<Context>
>;

export class EventBuilder<Input, Context, MwContext> {
  private constructor(
    private middleware: EventMiddleware<Context, MwContext, unknown>,
  ) {}

  use<NewMwContext, PipedMwContext>(
    middleware: EventMiddleware<Context, NewMwContext, PipedMwContext>,
  ): EventBuilder<Input, Context, NewMwContext> {
    return new EventBuilder(this.middleware.pipe(middleware as never) as never);
  }
  input<NewInput>(): EventBuilder<NewInput, Context, MwContext> {
    return new EventBuilder(this.middleware);
  }

  handler(
    handler: EventHandler<Input, Context, MwContext>,
  ): HandlerNode<Input, Context, MwContext> {
    return {
      type: "handler",
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

export type EventMiddlewareHandler<Context, MwContext, PipedMwContext> = (opt: {
  /**
   * The global eventrouter context
   */
  ctx: Context;
  /**
   * The middleware context output by the piped middleware (if any)
   */
  mwc: PipedMwContext;
}) => MwContext | Promise<MwContext>;

export interface EventMiddleware<Context, MwContext, PipedMwContext>
  extends EventMiddlewareHandler<Context, MwContext, PipedMwContext> {
  pipe: EventMiddlewareBuilder<Context, MwContext>;
}

export type InferEventInput<T extends AnyHandlerNode["handler"]> =
  T extends EventHandler<infer I, infer _C, infer _MW> ? I : never;

export type InferEventContext<T extends AnyEventNode> =
  T extends AnyEventNode<infer C> ? C : never;
