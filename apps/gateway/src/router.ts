import type { CharacterId } from "@mp/db/types";
import { EventRouterBuilder } from "@mp/event-router";
import type { InjectionContainer } from "@mp/ioc";
import { gatewayRoles } from "@mp/keycloak";
import type { RoleDefinition } from "@mp/oauth";
import { assertRoles } from "@mp/oauth";
import {
  ctxDbClient,
  ctxGameEventClient,
  ctxUserSession,
  ctxUserSessionSignal,
} from "./context";
import { hasAccessToCharacter } from "./db-operations";

const evt = new EventRouterBuilder().context<InjectionContainer>().build();

export type GatewayRouter = typeof gatewayRouter;
export const gatewayRouter = evt.router({
  gateway: evt.router({
    spectate: evt.event
      .use(roles([gatewayRoles.spectate]))
      .input<CharacterId>()
      .handler(({ ctx, input: characterId }) => {
        const session = ctx.get(ctxUserSessionSignal);
        session.value = {
          ...session.value,
          character: { id: characterId, type: "spectator" },
        };
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
        session.value = {
          ...session.value,
          character: { id: characterId, type: "player" },
        };
        ctx.get(ctxGameEventClient).network.requestFullState();
      }),

    leave: evt.event.input<CharacterId>().handler(({ ctx }) => {
      const session = ctx.get(ctxUserSessionSignal);
      session.value = { ...session.value, character: undefined };
    }),
  }),
});

export function roles(requiredRoles: Iterable<RoleDefinition>) {
  const requiredRolesSet = new Set(requiredRoles);
  return evt.middleware(({ ctx }) => {
    const session = ctx.get(ctxUserSession);
    if (!session.user) {
      throw new Error("User is not authenticated");
    }
    assertRoles(requiredRolesSet, session.user.roles)._unsafeUnwrap();
    return { user: session.user };
  });
}
