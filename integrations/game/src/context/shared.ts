import type { ProxyEventInvoker } from "@mp/event-router";
import { InjectionContext } from "@mp/ioc";
import type { GameServerEventRouter } from "../package.server";

export const ctxGameEventClient =
  InjectionContext.new<GameEventClient>("GameEventClient");

export type GameEventClient = ProxyEventInvoker<GameServerEventRouter>;
