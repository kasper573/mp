import { ctxGameStateMachine } from "../game-state";
import { rpc } from "../rpc";
import { roles } from "../user/auth";
import { defineRoles } from "../user/define-roles";
import { ctxRng } from "../rng";
import { ctxNpcSpawner } from "./npc-spawner";

export const npcRoles = defineRoles("npc", ["spawnRandom"]);

export type NpcRouter = typeof npcRouter;
export const npcRouter = rpc.router({
  spawnRandomNpc: rpc.procedure
    .use(roles([npcRoles.spawnRandom]))
    .mutation(({ ctx }) => {
      const state = ctx.get(ctxGameStateMachine);
      const rng = ctx.get(ctxRng);
      const spawner = ctx.get(ctxNpcSpawner);

      const selected = rng.oneOfMaybe(spawner.options);
      if (!selected) {
        throw new Error("No npcs or npc spawns available");
      }

      const instance = spawner.createInstance(selected.npc, selected.spawn);
      state.actors.set(instance.id, { type: "npc", ...instance });
    }),
});

export const npcRouterSlice = { npc: npcRouter };
