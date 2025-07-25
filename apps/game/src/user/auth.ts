import type { RoleDefinition } from "@mp/auth";
import { evt } from "../network/event-builder";

import { ctxGameplaySession } from "./session";

export function roles(requiredRoles: Iterable<RoleDefinition>) {
  const requiredRolesSet = new Set(requiredRoles);
  return evt.middleware(({ ctx }) => {
    const session = ctx.get(ctxGameplaySession);
    const userId = session.userId;
    if (userId === undefined) {
      throw new Error("User is not authenticated");
    }
    if (!requiredRolesSet.isSubsetOf(session.roles)) {
      const missingRoles = requiredRolesSet.difference(session.roles);
      throw new Error(
        "Missing permissions: " + missingRoles.values().toArray().join(", "),
      );
    }
    return { userId };
  });
}
