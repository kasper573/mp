import type { StateAccess } from "@mp/sync/server";
import { roles } from "../../middlewares/auth";
import { t } from "../../trpc";
import type { WorldState } from "../../package";
import type { AreaLookup } from "../area/loadAreas";
import { spawnNpcInstance } from "./npcSpawnBehavior";
import type { NPCService } from "./service";

export interface NPCRouterDependencies {
  state: StateAccess<WorldState>;
  areas: AreaLookup;
  npcService: NPCService;
}

export type NPCRouter = ReturnType<typeof createNPCRouter>;
export function createNPCRouter({
  state: accessState,
  areas,
  npcService,
}: NPCRouterDependencies) {
  return t.router({
    spawnRandomNPC: t.procedure.use(roles(["spawn_npc"])).mutation(async () => {
      const [{ npc, spawn }] = await npcService.getAllSpawnsAndTheirNpcs();

      accessState("world.spawnRandomNPC", (state) => {
        const instance = spawnNpcInstance(npc, spawn, areas.get(spawn.areaId)!);
        state.actors[instance.id] = { type: "npc", ...instance };
      });
    }),
  });
}
