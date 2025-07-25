import type { RoleDefinition } from "@mp/auth";
import { evt } from "../network/event-builder";

import { ctxUserSession } from "./session";

export function roles(requiredRoles: Iterable<RoleDefinition>) {
  const requiredRolesSet = new Set(requiredRoles);
  return evt.middleware(({ ctx }) => {
    const user = ctx.access(ctxUserSession).unwrapOr(undefined)?.user;
    if (!user) {
      throw new Error("User is not authenticated");
    }
    if (!requiredRolesSet.isSubsetOf(user.roles)) {
      const missingRoles = requiredRolesSet.difference(user.roles);
      throw new Error(
        "Missing permissions: " + missingRoles.values().toArray().join(", "),
      );
    }
    return { user };
  });
}
