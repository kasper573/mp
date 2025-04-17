import { RpcError } from "@mp/rpc";
import { InjectionContext } from "@mp/ioc";
import type { UserIdentity } from "@mp/auth";
import { rpc } from "../rpc";
import type { RoleDefinition } from "./define-roles";

export const ctxUserIdentity = InjectionContext.new<UserIdentity | undefined>();

export function auth() {
  return rpc.middleware(({ ctx }) => {
    const user = ctx.get(ctxUserIdentity);
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
  return rpc.middleware(({ ctx }) => {
    const user = ctx.get(ctxUserIdentity);
    return { user };
  });
}
