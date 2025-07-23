import type { AccessToken, RoleDefinition, UserId } from "@mp/auth";
import type { ApiContext } from "../rpc";
import { rpc } from "../rpc";
import { InjectionContext } from "@mp/ioc";
import type { TokenResolver } from "@mp/auth/server";

export const ctxToken = InjectionContext.new<AccessToken>("AccessToken");

export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");

export function auth() {
  return rpc.middleware(async ({ ctx, next }) => {
    const res = await resolveAuth(ctx);
    if (res.isErr()) {
      throw new Error("Authentication failed", { cause: res.error });
    }
    return next({ ctx: { ...ctx, user: res.value } });
  });
}

export function roles(requiredRoles: RoleDefinition[]) {
  return auth().unstable_pipe(({ ctx, next }) => {
    const requiredRolesSet = new Set(requiredRoles);
    if (!requiredRolesSet.isSubsetOf(ctx.user.roles)) {
      const missingRoles = requiredRolesSet.difference(ctx.user.roles);
      throw new Error(
        "Missing permissions: " + missingRoles.values().toArray().join(", "),
      );
    }
    return next({ ctx });
  });
}

export function optionalAuth() {
  return rpc.middleware(async ({ ctx, next }) => {
    const res = await resolveAuth(ctx);
    return next({ ctx: { ...ctx, user: res.unwrapOr(undefined) } });
  });
}

function resolveAuth(ctx: ApiContext) {
  const token = ctx.ioc.access(ctxToken).unwrapOr(undefined);
  const resolve = ctx.ioc.get(ctxTokenResolver);
  return resolve(token);
}

export interface AuthContext {
  userId: UserId;
}
