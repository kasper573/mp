import { TRPCError } from "@trpc/server";
import { authServerContext, authTokenContext } from "@mp-modules/user";
import { t } from "../trpc";

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
