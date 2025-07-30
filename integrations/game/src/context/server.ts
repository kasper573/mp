import type { AreaResource } from "@mp/game-shared";
import { InjectionContext } from "@mp/ioc";
import type { TokenResolver } from "@mp/oauth/server";
import type { GameEventClient } from "./shared";

export const ctxArea = InjectionContext.new<AreaResource>("Area");
export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");

export const ctxGameEventClient =
  InjectionContext.new<GameEventClient>("GameEventClient");
