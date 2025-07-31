import type { ActorId } from "@mp/game-shared";
import { characterRoles } from "@mp/keycloak";
import { assert } from "@mp/std";
import { ctxGameState, ctxGameStateServer } from "../context";
import { roles } from "../integrations/auth";
import { evt } from "../integrations/event-router";

export const kill = evt.event
  .input<{ targetId: ActorId }>()
  .use(roles([characterRoles.kill]))
  .handler(({ input: { targetId }, ctx }) => {
    const state = ctx.get(ctxGameState);
    const server = ctx.get(ctxGameStateServer);
    const target = assert(state.actors.get(targetId));
    target.combat.health = 0;
    server.addEvent("actor.death", target.identity.id);
  });
