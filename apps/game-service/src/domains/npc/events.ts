import { ctxGameState } from "@mp/game-shared";
import { npcRoles } from "@mp/keycloak";
import { ctxRng } from "../../context";
import { roles } from "../../middlewares/auth";
import { evt } from "../network/event-builder";
import { ctxNpcSpawner } from "./npc-spawner";

export type NpcEventRouter = typeof npcEventRouter;
export const npcEventRouter = evt.router({
  spawnRandomNpc: evt.event
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
      state.actors.set(instance.identity.id, instance);
    }),
});

export const npcEventRouterSlice = { npc: npcEventRouter };
