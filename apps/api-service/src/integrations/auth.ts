import type { RoleDefinition, UserId } from "@mp/oauth";
import { TRPCError } from "@trpc/server";
import { ctxAccessToken, ctxTokenResolver } from "../ioc";
import type { ApiContext } from "./trpc";
import { rpc } from "./trpc";

export function auth() {
  return rpc.middleware(async ({ ctx, next }) => {
    const res = await resolveAuth(ctx);
    if (res.isErr()) {
      throw new TRPCError({ code: "UNAUTHORIZED", cause: res.error });
    }
    return next({ ctx: { ...ctx, user: res.value } });
  });
}

export function roles(requiredRoles: RoleDefinition[]) {
  return auth().unstable_pipe(({ ctx, next }) => {
    const requiredRolesSet = new Set(requiredRoles);
    if (!requiredRolesSet.isSubsetOf(ctx.user.roles)) {
      const missingRoles = requiredRolesSet.difference(ctx.user.roles);
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Missing permissions: " + missingRoles.values().toArray().join(", "),
      });
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
  const token = ctx.ioc.get(ctxAccessToken);
  const resolve = ctx.ioc.get(ctxTokenResolver);
  return resolve(token);
}

export interface AuthContext {
  userId: UserId;
}
