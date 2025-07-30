import type { DbClient } from "@mp/db";
import type { CharacterId } from "@mp/db/types";
import { evt, roles } from "@mp/game/server";
import type { UserSession } from "@mp/game/shared";
import { ctxGameEventClient } from "@mp/game/shared";
import { InjectionContext } from "@mp/ioc";
import { gatewayRoles } from "@mp/keycloak";
import type { Signal } from "@mp/state";
import { hasAccessToCharacter } from "./db-operations";

export type GatewayRouter = typeof gatewayRouter;
export const gatewayRouter = evt.router({
  gateway: evt.router({
    spectate: evt.event
      .use(roles([gatewayRoles.spectate]))
      .input<CharacterId>()
      .handler(({ ctx, input: characterId }) => {
        const session = ctx.get(ctxUserSessionSignal);
        session.value = { ...session.value, characterId };
        ctx.get(ctxGameEventClient).network.requestFullState();
      }),

    join: evt.event
      .use(roles([gatewayRoles.join]))
      .input<CharacterId>()
      .handler(async ({ ctx, input: characterId, mwc }) => {
        const db = ctx.get(ctxDbClient);
        if (!(await hasAccessToCharacter(db, mwc.user.id, characterId))) {
          throw new Error("You do not have access to this character");
        }

        const session = ctx.get(ctxUserSessionSignal);
        session.value = { ...session.value, characterId };
        ctx.get(ctxGameEventClient).network.requestFullState();
      }),

    leave: evt.event.input<CharacterId>().handler(({ ctx }) => {
      const session = ctx.get(ctxUserSessionSignal);
      session.value = { ...session.value, characterId: undefined };
    }),
  }),
});

export const ctxUserSessionSignal =
  InjectionContext.new<Signal<UserSession>>("UserSessionSignal");

export const ctxDbClient = InjectionContext.new<DbClient>("DbClient");
