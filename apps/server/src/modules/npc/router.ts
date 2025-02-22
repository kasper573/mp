import type { PatchStateMachine } from "@mp/sync-server";
import { roles } from "../../middlewares/auth.ts";
import { t } from "../../trpc.ts";
import type { WorldState } from "../../package.ts";
import type { AreaLookup } from "../area/loadAreas.ts";
import { spawnNpcInstance } from "./npcSpawnBehavior.ts";
import type { NPCService } from "./service.ts";

export interface NPCRouterDependencies {
  state: PatchStateMachine<WorldState>;
  areas: AreaLookup;
  npcService: NPCService;
}

export type NPCRouter = ReturnType<typeof createNPCRouter>;
export function createNPCRouter({
  state,
  areas,
  npcService,
}: NPCRouterDependencies) {
  return t.router({
    spawnRandomNPC: t.procedure.use(roles(["spawn_npc"])).mutation(async () => {
      const [{ npc, spawn }] = await npcService.getAllSpawnsAndTheirNpcs();
      const instance = spawnNpcInstance(npc, spawn, areas.get(spawn.areaId)!);
      state.actors.set(instance.id, { type: "npc", ...instance });
    }),
  });
}
