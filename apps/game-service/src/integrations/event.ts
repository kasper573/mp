import type { EventMiddleware } from "@mp/event-router";
import { EventRouterBuilder } from "@mp/event-router";
import type { ImmutableInjectionContainer } from "@mp/ioc";

export const evt = new EventRouterBuilder()
  .context<GameServiceContext>()
  .build();

export type GameServiceMiddleware = EventMiddleware<
  GameServiceContext,
  unknown,
  unknown
>;

export type GameServiceContext = ImmutableInjectionContainer;
