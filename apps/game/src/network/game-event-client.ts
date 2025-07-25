import { InjectionContext } from "@mp/ioc";
import type { GameServerEventRouter } from "./root-event-router";
import type { ProxyEventInvoker } from "@mp/event-router";

export const ctxGameEventClient =
  InjectionContext.new<GameEventClient>("GameEventClient");

export type GameEventClient = ProxyEventInvoker<GameServerEventRouter>;
