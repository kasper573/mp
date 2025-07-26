import { and, characterTable, eq, type DbClient } from "@mp/db-client";
import type { UserId } from "@mp/auth";
import type { CharacterId } from "@mp/game/server";
import {
  evt,
  roles,
  gatewayRoles,
  networkEventRouter,
  ctxUserSession,
} from "@mp/game/server";
import { ctxGameEventClient } from "@mp/game/server";

import type { InjectionContainer } from "@mp/ioc";
import { InjectionContext } from "@mp/ioc";

export type GatewayRouter = typeof gatewayRouter;
export const gatewayRouter = evt.router({
  gateway: evt.router({
    spectate: evt.event
      .use(roles([gatewayRoles.spectate]))
      .input<CharacterId>()
      .handler(({ ctx, input: characterId }) => {
        const session = ctx.get(ctxUserSession);
        session.characterId = characterId;
        ctx.get(ctxGameEventClient).network.requestFullState();
      }),

    join: evt.event
      .use(roles([gatewayRoles.join]))
      .input<CharacterId>()
      .handler(async ({ ctx, input: characterId, mwc }) => {
        if (!(await hasAccessToCharacter(ctx, mwc.user.id, characterId))) {
          throw new Error("You do not have access to this character");
        }

        const session = ctx.get(ctxUserSession);
        session.characterId = characterId;
        ctx.get(ctxGameEventClient).network.requestFullState();
      }),

    leave: evt.event.input<CharacterId>().handler(({ ctx }) => {
      // Removing the clients character from the registry will eventually
      // lead to the game behavior removing the actor from the game state.
      // This allows the character to remain in the game state for a moment before removal,
      // preventing "quick disconnect" cheating, or allows for connection losses to be handled gracefully.
      const session = ctx.get(ctxUserSession);
      delete session.characterId;
    }),
  }),
});

export const worldEventRouterSlice = { world: networkEventRouter };

export const ctxDbClient = InjectionContext.new<DbClient>("DbClient");

async function hasAccessToCharacter(
  ctx: InjectionContainer,
  userId: UserId,
  characterId: CharacterId,
) {
  const db = ctx.get(ctxDbClient);
  const matches = await db.$count(
    db
      .select()
      .from(characterTable)
      .where(
        and(
          eq(characterTable.userId, userId),
          eq(characterTable.id, characterId),
        ),
      ),
  );

  return matches > 0;
}
