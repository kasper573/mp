import { InjectionContext } from "@mp/ioc";
import type { RoleDefinition, UserId } from "@mp/auth";
import type { TokenResolver } from "@mp/auth/server";
import { rpc } from "../rpc/rpc-definition";
import { ctxClientRegistry } from "./client-registry";
import { ctxClientId } from "./client-id";
import { ctxUserService } from "./service";

export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");

export function auth() {
  return rpc.middleware(({ ctx }): AuthContext => {
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
    const userService = ctx.get(ctxUserService);
    const roles = await userService.getRoles(mwc.userId);
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
  return rpc.middleware(({ ctx }): Partial<AuthContext> => {
    const clientId = ctx.get(ctxClientId);
    const clients = ctx.get(ctxClientRegistry);
    const userId = clients.userIds.get(clientId);
    return { userId };
  });
}

export interface AuthContext {
  userId: UserId;
}
