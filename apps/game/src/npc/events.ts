import { ctxGameState } from "../game-state/game-state";

import { ctxRng } from "../rng";
import { npcRoles } from "../user/roles";
import { ctxNpcSpawner } from "./npc-spawner";
import { roles } from "../user/auth";
import { eventHandlerBuilder } from "../network/event-definition";

export type NpcEventRouter = typeof npcEventRouter;
export const npcEventRouter = eventHandlerBuilder.router({
  spawnRandomNpc: eventHandlerBuilder.event
    .use(roles([npcRoles.spawnRandom]))
    .handler(({ ctx }) => {
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

export const npcEventRouterSlice = { npc: npcEventRouter };
