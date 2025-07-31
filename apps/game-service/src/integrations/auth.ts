import { type RoleDefinition, assertRoles } from "@mp/oauth";
import { ctxUserSession } from "../context";
import { evt } from "./event-router";

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
