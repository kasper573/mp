import { InjectionContext } from "@mp/ioc";
import type { RNG } from "@mp/std";

export const ctxRng = InjectionContext.new<RNG>("RNG");
