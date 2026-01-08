import { type RoleDefinition, assertRoles } from "@mp/auth";
import { ctxUserSession } from "../context";
import { evt } from "./event-router";

export function roles(requiredRoles: Iterable<RoleDefinition>) {
  const requiredRolesSet = new Set(requiredRoles);
  return evt.middleware(({ ctx }) => {
    const session = ctx.get(ctxUserSession);
    if (!session.user) {
      throw new Error("User is not authenticated");
    }
    const res = assertRoles(requiredRolesSet, session.user.roles);
    if (res.isErr()) {
      throw new Error(res.error);
    }
    return { user: session.user };
  });
}
