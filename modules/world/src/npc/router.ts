import { roles } from "@mp-modules/user";
import { t } from "@mp-modules/trpc";
import { ctx_areaLookup } from "@mp-modules/area";
import { ctx_worldStateMachine } from "../world/WorldState";
import { spawnNpcInstance } from "./npcSpawnBehavior";
import { ctx_npcService } from "./service";

export type NPCRouter = typeof npcRouter;
export const npcRouter = t.router({
  spawnRandomNPC: t.procedure
    .use(roles(["spawn_npc"]))
    .mutation(async ({ ctx }) => {
      const npcService = ctx.ioc.get(ctx_npcService);
      const state = ctx.ioc.get(ctx_worldStateMachine);
      const areas = ctx.ioc.get(ctx_areaLookup);
      const [{ npc, spawn }] = await npcService.getAllSpawnsAndTheirNpcs();
      const area = areas.get(spawn.areaId);
      if (!area) {
        throw new Error(`Area not found: ${spawn.areaId}`);
      }
      const instance = spawnNpcInstance(npc, spawn, area);
      state.actors.set(instance.id, { type: "npc", ...instance });
    }),
});
