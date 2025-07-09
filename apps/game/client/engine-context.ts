import type { Engine } from "@mp/engine";
import { InjectionContext } from "@mp/ioc";

export const ctxEngine = InjectionContext.new<Engine>("Engine");
