import { InjectionContext } from "@mp/ioc";
import type { TokenResolver } from "@mp/oauth/server";
import type { AreaResource } from "../area/area-resource";

export const ctxArea = InjectionContext.new<AreaResource>("Area");
export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");
