import type { RoleDefinition } from "@mp/auth";
import { evt } from "../network/event-builder";
import { ctxClientRegistry } from "./client-registry";
import { ctxClientId } from "./client-id";
import { ctxGameStateLoader } from "../game-state/game-state-loader";

export function roles(requiredRoles: RoleDefinition[]) {
  return evt.middleware(async ({ ctx, mwc }) => {
    const clientId = ctx.get(ctxClientId);
    const clients = ctx.get(ctxClientRegistry);
    const userId = clients.userIds.get(clientId);
    if (userId === undefined) {
      throw new Error("User not authenticated");
    }
    const loader = ctx.get(ctxGameStateLoader);
    const roles = await loader.getUserRoles(userId);
    const requiredRolesSet = new Set(requiredRoles);
    if (!requiredRolesSet.isSubsetOf(roles)) {
      const missingRoles = requiredRolesSet.difference(roles);
      throw new Error(
        "Missing permissions: " + missingRoles.values().toArray().join(", "),
      );
    }
    return mwc;
  });
}
