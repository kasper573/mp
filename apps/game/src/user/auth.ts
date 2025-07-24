import type { RoleDefinition, UserId } from "@mp/auth";
import { evt } from "../network/event-builder";
import { ctxClientRegistry } from "./client-registry";
import { ctxClientId } from "./client-id";
import { ctxGameStateLoader } from "../game-state/game-state-loader";

export function auth() {
  return evt.middleware(({ ctx }): AuthContext => {
    const clientId = ctx.get(ctxClientId);
    const clients = ctx.get(ctxClientRegistry);
    const userId = clients.userIds.get(clientId);
    if (userId === undefined) {
      throw new Error("User not authenticated");
    }
    return { userId };
  });
}

export function roles(requiredRoles: RoleDefinition[]) {
  return auth().pipe(async ({ ctx, mwc }) => {
    const loader = ctx.get(ctxGameStateLoader);
    const roles = await loader.getUserRoles(mwc.userId);
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

export function optionalAuth() {
  return evt.middleware(({ ctx }): Partial<AuthContext> => {
    const clientId = ctx.get(ctxClientId);
    const clients = ctx.get(ctxClientRegistry);
    const userId = clients.userIds.get(clientId);
    return { userId };
  });
}

export interface AuthContext {
  userId: UserId;
}
