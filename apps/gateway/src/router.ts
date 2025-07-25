import type { AccessToken } from "@mp/auth";
import type { CharacterId } from "@mp/game/server";
import {
  evt,
  roles,
  worldRoles,
  ctxGameStateLoader,
  ctxTokenResolver,
  networkEventRouter,
  ctxUserSession,
} from "@mp/game/server";
import { ctxGameEventClient } from "@mp/game/server";

export type GatewayRouter = typeof gatewayRouter;
export const gatewayRouter = evt.router({
  gateway: evt.router({
    spectate: evt.event
      .use(roles([worldRoles.spectate]))
      .input<CharacterId>()
      .handler(({ ctx, input }) => {
        const session = ctx.get(ctxUserSession);
        session.player = {
          characterId: input,
          clientType: "spectator",
        };
        ctx.get(ctxGameEventClient).network.requestFullState();
      }),

    join: evt.event
      .use(roles([worldRoles.join]))
      .handler(async ({ ctx, mwc }) => {
        const loader = ctx.get(ctxGameStateLoader);
        const char = await loader.getOrCreateCharacterForUser(mwc.user.id);
        const session = ctx.get(ctxUserSession);
        session.player = {
          characterId: char.identity.id,
          clientType: "player",
        };
        ctx.get(ctxGameEventClient).network.requestFullState();
      }),

    leave: evt.event.input<CharacterId>().handler(({ ctx }) => {
      // Removing the clients character from the registry will eventually
      // lead to the game behavior removing the actor from the game state.
      // This allows the character to remain in the game state for a moment before removal,
      // preventing "quick disconnect" cheating, or allows for connection losses to be handled gracefully.
      const session = ctx.get(ctxUserSession);
      delete session.player;
    }),

    auth: evt.event.input<AccessToken>().handler(async ({ input, ctx }) => {
      const tokenResolver = ctx.get(ctxTokenResolver);
      const result = await tokenResolver(input);
      if (result.isErr()) {
        throw new Error("Invalid token", { cause: result.error });
      }
      const session = ctx.get(ctxUserSession);
      const { id, roles } = result.value;
      session.user = { id, roles };
    }),
  }),
});

export const worldEventRouterSlice = { world: networkEventRouter };
