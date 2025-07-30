import type { Engine } from "@mp/engine";
import { InjectionContext } from "@mp/ioc";
import type { AuthClient } from "@mp/oauth/client";

export const ctxEngine = InjectionContext.new<Engine>("Engine");
export const ctxAuthClient = InjectionContext.new<AuthClient>("AuthClient");
