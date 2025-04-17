import { RpcError } from "@mp/rpc";
import { InjectionContext } from "@mp/ioc";
import type { UserIdentity } from "@mp/auth";
import type { TokenVerifier } from "@mp/auth/server";
import { rpc } from "../rpc";
import { ctxClientRegistry } from "./client-registry";
import type { RoleDefinition } from "./define-roles";
import { ctxClientId } from "./client-id";

export const ctxTokenVerifier =
  InjectionContext.new<TokenVerifier>("TokenVerifier");

export function auth() {
  return rpc.middleware(({ ctx }): AuthContext => {
    const clients = ctx.get(ctxClientRegistry);
    const clientId = ctx.get(ctxClientId);
    const user = clients.getUser(clientId);

    if (!user) {
      throw new RpcError("User is not authenticated");
    }
    return { user };
  });
}

export function roles(requiredRoles: RoleDefinition[]) {
  return auth().pipe(({ mwc }) => {
    if (!new Set(requiredRoles).isSubsetOf(mwc.user.roles)) {
      throw new RpcError("Insufficient permissions");
    }

    return mwc;
  });
}

export function optionalAuth() {
  return rpc.middleware(({ ctx }): Partial<AuthContext> => {
    const clients = ctx.get(ctxClientRegistry);
    const clientId = ctx.get(ctxClientId);
    const user = clients.getUser(clientId);

    return { user };
  });
}

export interface AuthContext {
  user: UserIdentity;
}
