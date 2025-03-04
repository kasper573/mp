import { TRPCError, t } from "@mp-modules/trpc";
import { InjectionContext } from "@mp/injector";
import type { AuthToken } from "@mp/auth";
import type { AuthServer } from "@mp/auth/server";
import type express from "express";
import { requestContext } from "./session";

export const authServerContext = InjectionContext.new<AuthServer>();

export const authTokenContext = requestContext.derive(deriveAuthToken);

export function deriveAuthToken(req: express.Request) {
  const parsedBearerToken =
    req.headers["authorization"]?.match(/^Bearer (.+)$/);

  if (parsedBearerToken) {
    return parsedBearerToken[1] as AuthToken;
  }
}

export function auth() {
  return t.middleware(async ({ ctx, next }) => {
    const authToken = ctx.injector.get(authTokenContext);
    if (!authToken) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "No token provided",
      });
    }

    const authServer = ctx.injector.get(authServerContext);
    const result = await authServer.verifyToken(authToken);
    if (result.isErr()) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: result.error });
    }

    return next({ ctx: { ...ctx, user: result.value } });
  });
}

export function roles(requiredRoles: string[]) {
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
    const authToken = ctx.injector.get(authTokenContext);
    const result = authToken
      ? await ctx.injector.get(authServerContext).verifyToken(authToken)
      : undefined;

    return next({
      ctx: { ...ctx, user: result?.isOk() ? result.value : undefined },
    });
  });
}
