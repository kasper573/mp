import { TRPCError } from "@trpc/server";
import { t } from "../trpc.ts";

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
