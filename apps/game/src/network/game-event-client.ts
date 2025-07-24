import { InjectionContext } from "@mp/ioc";
import type { GameServerEventRouter } from "./root-event-router";
import type { EventRouterProxyInvoker } from "@mp/event-router";

export const ctxGameEventClient =
  InjectionContext.new<GameEventClient>("GameEventClient");

export type GameEventClient = EventRouterProxyInvoker<GameServerEventRouter>;
