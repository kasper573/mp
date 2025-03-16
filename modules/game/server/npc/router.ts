import { roles } from "@mp-modules/user";
import { t } from "@mp-modules/trpc/server";
import { ctx_gameStateMachine } from "../GameState";
import { ctx_areaLookup } from "../area/loadAreas";
import { spawnNpcInstance } from "./npcSpawnBehavior";
import { ctx_npcService } from "./service";

export type NPCRouter = typeof npcRouter;
export const npcRouter = t.router({
  spawnRandomNPC: t.procedure
    .use(roles(["spawn_npc"]))
    .mutation(async ({ ctx }) => {
      const npcService = ctx.ioc.get(ctx_npcService);
      const state = ctx.ioc.get(ctx_gameStateMachine);
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

export const npcRouterSlice = { npc: npcRouter };
