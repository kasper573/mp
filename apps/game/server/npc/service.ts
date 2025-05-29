import { InjectionContext } from "@mp/ioc";

export interface NpcService {
  getAllSpawnsAndTheirNpcs: () => Promise<unknown[]>;
}

export const ctxNpcService = InjectionContext.new<NpcService>("NpcService");
