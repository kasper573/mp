import { ctxGameState } from "../game-state/game-state";
import { rpc } from "../rpc/rpc-definition";
import { ctxRng } from "../rng";
import { npcRoles } from "../user/roles";
import { ctxNpcSpawner } from "./npc-spawner";
import { roles } from "../user/auth";

export type NpcRouter = typeof npcRouter;
export const npcRouter = rpc.router({
  spawnRandomNpc: rpc.procedure
    .use(roles([npcRoles.spawnRandom]))
    .mutation(({ ctx }) => {
      const state = ctx.get(ctxGameState);
      const rng = ctx.get(ctxRng);
      const spawner = ctx.get(ctxNpcSpawner);

      const selected = rng.oneOfMaybe(spawner.options);
      if (!selected) {
        throw new Error("No npcs or npc spawns available");
      }

      const instance = spawner.createInstance(selected.npc, selected.spawn);
      state.actors.set(instance.id, instance);
    }),
});

export const npcRouterSlice = { npc: npcRouter };
