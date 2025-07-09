import type { AuthClient } from "@mp/auth/client";
import type { Engine } from "@mp/engine";
import { InjectionContext } from "@mp/ioc";

export const ctxEngine = InjectionContext.new<Engine>("Engine");
export const ctxAuthClient = InjectionContext.new<AuthClient>("AuthClient");
