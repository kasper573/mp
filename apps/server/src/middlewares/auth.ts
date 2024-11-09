import { t } from "../trpc";

export function auth() {
  return t.middleware(async ({ ctx, next }) => {
    const { authToken, auth } = ctx;
    if (!authToken) {
      throw new Error(`Client provided no auth token`);
    }

    try {
      const { userId } = await auth.verifyToken(authToken);
      return next({ ctx: { ...ctx, userId } });
    } catch (error) {
      throw new Error(`Client failed to authenticate: ${String(error)}`);
    }
  });
}
