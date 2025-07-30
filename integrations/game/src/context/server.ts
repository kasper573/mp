import type { AreaResource } from "@mp/game-shared";
import { InjectionContext } from "@mp/ioc";
import type { TokenResolver } from "@mp/oauth/server";

export const ctxArea = InjectionContext.new<AreaResource>("Area");
export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");
