import { InjectionContext } from "@mp/ioc";
import type { NpcSpawn, Npc } from "./types";

export interface NpcService {
  getAllSpawnsAndTheirNpcs: () => Promise<Array<{ spawn: NpcSpawn; npc: Npc }>>;
}

export const ctxNpcService = InjectionContext.new<NpcService>("NpcService");
