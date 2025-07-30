import { ctxUserSession } from "@mp/game-shared";
import type { RoleDefinition } from "@mp/oauth";
import { evt } from "./event";

export function roles(requiredRoles: Iterable<RoleDefinition>) {
  const requiredRolesSet = new Set(requiredRoles);
  return evt.middleware(({ ctx }) => {
    const session = ctx.access(ctxUserSession).unwrapOr(undefined);
    if (!session) {
      throw new Error("No user session available");
    }
    if (!session.user) {
      throw new Error("User is not authenticated");
    }
    if (!requiredRolesSet.isSubsetOf(session.user.roles)) {
      const missingRoles = requiredRolesSet.difference(session.user.roles);
      throw new Error(
        "Missing permissions: " + missingRoles.values().toArray().join(", "),
      );
    }
    return { user: session.user };
  });
}
