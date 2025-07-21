import { ctxGameState } from "../game-state/game-state";
import { eventHandlerBuilder } from "../network/event-definition";
import { roles } from "../user/auth";
import { ctxClientRegistry } from "../user/client-registry";
import { ctxClientId } from "../user/client-id";

import type { CharacterId } from "../character/types";
import { ctxCharacterService } from "../character/service";
import { ctxGameStateServer } from "../game-state/game-state-server";
import { worldRoles } from "../user/roles";

export type WorldRouter = typeof worldRouter;
export const worldRouter = eventHandlerBuilder.router({
  spectate: eventHandlerBuilder.event
    .use(roles([worldRoles.spectate]))
    .input<CharacterId>()
    .handler(({ ctx, input }) => {
      const clients = ctx.get(ctxClientRegistry);
      const clientId = ctx.get(ctxClientId);
      clients.spectatedCharacterIds.set(clientId, input);
      const server = ctx.get(ctxGameStateServer);
      server.markToResendFullState(clientId);
    }),

  join: eventHandlerBuilder.event
    .use(roles([worldRoles.join]))
    .handler(async ({ ctx, mwc }) => {
      const clientId = ctx.get(ctxClientId);
      const state = ctx.get(ctxGameState);
      const server = ctx.get(ctxGameStateServer);
      server.markToResendFullState(clientId);

      const characterService = ctx.get(ctxCharacterService);
      let char = state.actors
        .values()
        .filter((actor) => actor.type === "character")
        .find((actor) => actor.userId === mwc.userId);

      if (!char) {
        char = await characterService.getOrCreateCharacterForUser(mwc.userId);
        state.actors.set(char.id, char);
      }

      const clients = ctx.get(ctxClientRegistry);
      clients.characterIds.set(clientId, char.id);

      server.addEvent(
        "world.joined",
        { areaId: char.areaId, characterId: char.id },
        { actors: [char.id] },
      );
    }),

  requestFullState: eventHandlerBuilder.event.handler(({ ctx }) => {
    const clientId = ctx.get(ctxClientId);
    const server = ctx.get(ctxGameStateServer);
    server.markToResendFullState(clientId);
  }),

  leave: eventHandlerBuilder.event.input<CharacterId>().handler(({ ctx }) => {
    const clientId = ctx.get(ctxClientId);
    const clients = ctx.get(ctxClientRegistry);

    // Removing the clients character from the registry will eventually
    // lead to the game behavior removing the actor from the game state.
    // This allows the character to remain in the game state for a moment before removal,
    // preventing "quick disconnect" cheating, or allows for connection losses to be handled gracefully.
    clients.characterIds.delete(clientId);
    clients.spectatedCharacterIds.delete(clientId);
  }),
});

export const worldEventRouterSlice = { world: worldRouter };
