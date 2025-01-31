import { TRPCError } from "@trpc/server";
import { t } from "../trpc";

export function auth() {
  return t.middleware(async ({ ctx, next }) => {
    const { authToken, auth } = ctx;
    if (!authToken) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "No token provided",
      });
    }

    const result = await auth.verifyToken(authToken);
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
    const { authToken, auth } = ctx;
    const result = authToken ? await auth.verifyToken(authToken) : undefined;
    return next({
      ctx: { ...ctx, user: result?.isOk() ? result.value : undefined },
    });
  });
}
