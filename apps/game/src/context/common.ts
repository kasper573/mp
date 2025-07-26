import type { AuthClient } from "@mp/auth/client";
import type { TokenResolver } from "@mp/auth/server";
import type { Engine } from "@mp/engine";
import { InjectionContext } from "@mp/ioc";
import type { Logger } from "@mp/logger";
import type { AreaResource } from "../area/area-resource";

export const ctxEngine = InjectionContext.new<Engine>("Engine");
export const ctxLogger = InjectionContext.new<Logger>("Logger");
export const ctxAuthClient = InjectionContext.new<AuthClient>("AuthClient");
export const ctxArea = InjectionContext.new<AreaResource>("Area");
export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");
