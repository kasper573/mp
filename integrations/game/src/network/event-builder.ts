import type { ImmutableInjectionContainer } from "@mp/ioc";
import type { EventRouterFactories, EventMiddleware } from "@mp/event-router";
import { EventRouterBuilder } from "@mp/event-router";

export const evt = createFactories();

export type GameEventRouterContext = ImmutableInjectionContainer;

export type GameEventRouterMiddleware = EventMiddleware<
  GameEventRouterContext,
  unknown,
  unknown
>;

function createFactories(): EventRouterFactories<GameEventRouterContext> {
  const builder = new EventRouterBuilder()
    .context<GameEventRouterContext>()
    .build();

  return {
    router: builder.router,
    event: builder.event,
    middleware: builder.middleware,
  };
}
