import { ctxGameStateMachine } from "../game-state";
import { ctxAreaLookup } from "../area/lookup";
import { rpc } from "../rpc";
import { roles } from "../user/auth";
import { defineRoles } from "../user/define-roles";
import { ctxActorModelLookup } from "../traits/appearance";
import { ctxNpcService } from "./service";
import { NpcSpawner } from "./npc-spawner";

export const npcRoles = defineRoles("npc", ["spawnRandom"]);

export type NpcRouter = typeof npcRouter;
export const npcRouter = rpc.router({
  spawnRandomNpc: rpc.procedure
    .use(roles([npcRoles.spawnRandom]))
    .mutation(async ({ ctx }) => {
      const npcService = ctx.get(ctxNpcService);
      const state = ctx.get(ctxGameStateMachine);
      const [{ npc, spawn }] = await npcService.getAllSpawnsAndTheirNpcs();
      const spawner = new NpcSpawner(
        ctx.get(ctxAreaLookup),
        ctx.get(ctxActorModelLookup),
      );
      const instance = spawner.createInstance(npc, spawn);
      state.actors.set(instance.id, { type: "npc", ...instance });
    }),
});

export const npcRouterSlice = { npc: npcRouter };
