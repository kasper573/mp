import type { ProxyEventInvoker } from "@mp/event-router";
import { InjectionContext } from "@mp/ioc";
import type { Logger } from "@mp/logger";
import type { GameServerEventRouter } from "../package.client";

export const ctxLogger = InjectionContext.new<Logger>("Logger");

export const ctxGameEventClient =
  InjectionContext.new<GameEventClient>("GameEventClient");

export type GameEventClient = ProxyEventInvoker<GameServerEventRouter>;
