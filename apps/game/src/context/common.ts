import type { AuthClient } from "@mp/auth/client";
import type { TokenResolver } from "@mp/auth/server";
import type { Engine } from "@mp/engine";
import { InjectionContext } from "@mp/ioc";
import type { Logger } from "@mp/logger";

export const ctxEngine = InjectionContext.new<Engine>("Engine");
export const ctxLogger = InjectionContext.new<Logger>("Logger");
export const ctxAuthClient = InjectionContext.new<AuthClient>("AuthClient");
export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");
