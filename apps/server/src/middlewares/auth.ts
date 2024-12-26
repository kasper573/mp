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
    if (!result.ok) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: result.error });
    }

    return next({ ctx: { ...ctx, user: result.user } });
  });
}

export function optionalAuth() {
  return t.middleware(async ({ ctx, next }) => {
    const { authToken, auth } = ctx;
    const result = authToken ? await auth.verifyToken(authToken) : undefined;
    return next({
      ctx: { ...ctx, user: result?.ok ? result.user : undefined },
    });
  });
}
