import { RPCError } from "@mp/rpc";
import { InjectionContext } from "@mp/ioc";
import type { AuthToken } from "@mp/auth";
import type { AuthServer } from "@mp/auth/server";
import { rpc } from "../rpc";
import type { RoleDefinition } from "./define-roles";

export const ctxAuthServer = InjectionContext.new<AuthServer>();

export const ctxAuthToken = InjectionContext.new<AuthToken | undefined>();

export function auth() {
  return rpc.middleware(async ({ ctx }) => {
    const authToken = ctx.get(ctxAuthToken);
    if (!authToken) {
      throw new RPCError({
        code: "UNAUTHORIZED",
        message: "No token provided",
      });
    }

    const authServer = ctx.get(ctxAuthServer);
    const result = await authServer.verifyToken(authToken);
    if (result.isErr()) {
      throw new RPCError({ code: "UNAUTHORIZED", message: result.error });
    }

    return { user: result.value };
  });
}

export function roles(requiredRoles: RoleDefinition[]) {
  return auth().pipe(({ mwc }) => {
    if (!new Set(requiredRoles).isSubsetOf(mwc.user.roles)) {
      throw new RPCError({
        code: "FORBIDDEN",
        message: "Insufficient permissions",
      });
    }

    return mwc;
  });
}

export function optionalAuth() {
  return rpc.middleware(async ({ ctx }) => {
    const authToken = ctx.get(ctxAuthToken);
    const result = authToken
      ? await ctx.get(ctxAuthServer).verifyToken(authToken)
      : undefined;

    return {
      user: result?.isOk() ? result.value : undefined,
    };
  });
}
