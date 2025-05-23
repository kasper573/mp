import { InjectionContext } from "@mp/ioc";
import type { Rng } from "@mp/std";

export const ctxRng = InjectionContext.new<Rng>("Rng");
