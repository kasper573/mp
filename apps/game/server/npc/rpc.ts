import { ctxGameStateMachine } from "../game-state";
import { ctxAreaLookup } from "../area/lookup";
import { rpc } from "../rpc";
import { roles } from "../user/auth";
import { defineRoles } from "../user/define-roles";
import { ctxActorModelLookup } from "../traits/appearance";
import { ctxRng } from "../rng";
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
      const rng = ctx.get(ctxRng);
      const options = await npcService.getAllSpawnsAndTheirNpcs();
      const spawner = new NpcSpawner(
        ctx.get(ctxAreaLookup),
        ctx.get(ctxActorModelLookup),
        rng,
      );

      const selected = rng.oneOfMaybe(options);
      if (!selected) {
        throw new Error("No npcs or npc spawns available");
      }

      const instance = spawner.createInstance(selected.npc, selected.spawn);
      state.actors.set(instance.id, { type: "npc", ...instance });
    }),
});

export const npcRouterSlice = { npc: npcRouter };
