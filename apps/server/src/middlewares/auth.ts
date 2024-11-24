import { t } from "../trpc";

export function auth() {
  return t.middleware(async ({ ctx, next }) => {
    const { authToken, auth } = ctx;
    if (!authToken) {
      throw new Error(`Client provided no auth token`);
    }

    const result = await auth.verifyToken(authToken);
    if (!result.ok) {
      throw new Error(`Client failed to authenticate: ${result.error}`);
    }

    return next({ ctx: { ...ctx, user: result.user } });
  });
}
