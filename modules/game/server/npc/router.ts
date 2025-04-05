import { defineRoles, roles } from "@mp-modules/user";
import { t } from "@mp-modules/trpc/server";
import { ctx_gameStateMachine } from "../game-state";
import { ctx_areaLookup } from "../area/load-areas";
import { spawnNpcInstance } from "./npc-spawn-behavior";
import { ctx_npcService } from "./service";

export const npcRoles = defineRoles("npc", ["spawnRandom"]);

export type NPCRouter = typeof npcRouter;
export const npcRouter = t.router({
  spawnRandomNPC: t.procedure
    .use(roles([npcRoles.spawnRandom]))
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
