import type { ProxyEventInvoker } from "@mp/event-router";
import type { AreaResource } from "@mp/game-shared";
import { InjectionContext } from "@mp/ioc";
import type { TokenResolver } from "@mp/oauth/server";
import type { Rng } from "@mp/std";
import type { GameServerEventRouter } from "./domains/network/root-event-router";

export const ctxArea = InjectionContext.new<AreaResource>("Area");
export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");

export const ctxGameEventClient =
  InjectionContext.new<ProxyEventInvoker<GameServerEventRouter>>(
    "GameEventClient",
  );
export const ctxRng = InjectionContext.new<Rng>("Rng");
