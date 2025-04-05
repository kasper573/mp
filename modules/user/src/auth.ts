import { TRPCError, t } from "@mp-modules/trpc/server";
import { InjectionContext } from "@mp/ioc";
import type { AuthToken } from "@mp/auth";
import type { AuthServer } from "@mp/auth/server";
import type express from "express";
import { ctxRequest } from "./session";
import type { RoleDefinition } from "./define-roles";

export const ctxAuthServer = InjectionContext.new<AuthServer>();

export const ctxAuthToken = ctxRequest.derive(deriveAuthToken);

export function deriveAuthToken(req: express.Request) {
  const parsedBearerToken =
    req.headers["authorization"]?.match(/^Bearer (.+)$/);

  if (parsedBearerToken) {
    return parsedBearerToken[1] as AuthToken;
  }
}

export function auth() {
  return t.middleware(async ({ ctx, next }) => {
    const authToken = ctx.ioc.get(ctxAuthToken);
    if (!authToken) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "No token provided",
      });
    }

    const authServer = ctx.ioc.get(ctxAuthServer);
    const result = await authServer.verifyToken(authToken);
    if (result.isErr()) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: result.error });
    }

    return next({ ctx: { ...ctx, user: result.value } });
  });
}

export function roles(requiredRoles: RoleDefinition[]) {
  return auth().unstable_pipe(async ({ ctx, next }) => {
    if (!new Set(requiredRoles).isSubsetOf(ctx.user.roles)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Insufficient permissions",
      });
    }

    return next({ ctx });
  });
}

export function optionalAuth() {
  return t.middleware(async ({ ctx, next }) => {
    const authToken = ctx.ioc.get(ctxAuthToken);
    const result = authToken
      ? await ctx.ioc.get(ctxAuthServer).verifyToken(authToken)
      : undefined;

    return next({
      ctx: { ...ctx, user: result?.isOk() ? result.value : undefined },
    });
  });
}
