import type { PatchStateMachine } from "@mp/sync/server";
import { roles } from "../../middlewares/auth";
import { t } from "../../trpc";
import type { AreaLookup } from "../area/loadAreas";
import type { WorldState } from "../world/WorldState";
import { spawnNpcInstance } from "./npcSpawnBehavior";
import type { NPCService } from "./service";

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
