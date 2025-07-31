import { EventRouterBuilder } from "@mp/event-router";
import type { InjectionContainer } from "@mp/ioc";
import type { RoleDefinition } from "@mp/oauth";
import { assertRoles } from "@mp/oauth";
import { ctxUserSession } from "../context";

export const evt = new EventRouterBuilder()
  .context<InjectionContainer>()
  .build();

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
