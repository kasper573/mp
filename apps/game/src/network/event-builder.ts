import { InjectionContext, type ImmutableInjectionContainer } from "@mp/ioc";
import type {
  EventRouterFactories,
  EventRouterMiddleware,
} from "@mp/event-router";
import { EventRouterBuilder } from "@mp/event-router";

export const ctxGlobalServerEventMiddleware =
  InjectionContext.new<GameEventRouterMiddleware>(
    "GlobalEventRouterMiddleware",
  );

export const evt = createFactories();

export type GameEventRouterContext = ImmutableInjectionContainer;

export type GameEventRouterMiddleware = EventRouterMiddleware<
  GameEventRouterContext,
  unknown,
  unknown
>;

function createFactories(): EventRouterFactories<GameEventRouterContext> {
  const builder = new EventRouterBuilder()
    .context<GameEventRouterContext>()
    .build();

  const globalMiddleware = builder.middleware((opt) => {
    const middleware = opt.ctx.access(ctxGlobalServerEventMiddleware);
    if (middleware.isOk()) {
      return middleware.value(opt);
    }
    return opt;
  });

  return {
    router: builder.router,
    event: builder.event.use(globalMiddleware),
    middleware: builder.middleware,
  };
}
