import { vec } from "@mp/math";
import type { StateAccess } from "@mp/sync/server";
import type { AreaId } from "@mp/data";
import type { Tile } from "@mp/std";
import { auth } from "../../middlewares/auth";
import { t } from "../../trpc";
import type { WorldState } from "../../package";
import type { AreaLookup } from "../area/loadAreas";
import { createNpcInstance } from "./npcSpawnBehavior";
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
    spawnProblematicNPC: t.procedure.use(auth()).mutation(async () => {
      const start = vec(3 as Tile, 15 as Tile);
      const end = vec(3 as Tile, 25 as Tile);

      const [{ npc }] = await npcService.getAllSpawnsAndTheirNpcs();

      accessState("world.spawnProblematicNPC", (state) => {
        const instance = createNpcInstance(npc, "forest" as AreaId, start);
        instance.path = [start, end];
        state.npcs[instance.id] = instance;
      });
    }),
  });
}
