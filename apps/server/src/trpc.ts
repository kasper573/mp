import { initTRPC } from "@trpc/server";
import type { Injector } from "@mp/injector";
import { sessionIdContext } from "@mp-modules/user";
import { transformer } from "./shared";
import { consumeLimiterForTRPC } from "./middlewares/rateLimit";
import { createRateLimiter } from "./createRateLimiter";
import { serverOptionsContext } from "./options";

const trpc = initTRPC.context<{ injector: Injector }>().create({
  transformer,
  errorFormatter: ({ shape, ctx }) => {
    if (ctx?.injector.get(serverOptionsContext).exposeErrorDetails) {
      return shape;
    }

    // Hide error details
    return {
      ...shape,
      data: { ...shape.data, path: null, stack: null },
      message: "An error occurred",
    };
  },
});

export const schemaFor = <T>() => ({ parse: (input: unknown) => input as T });

const globalRequestLimit = createRateLimiter({
  points: 20,
  duration: 1,
});

const globalMiddleware = trpc.middleware(async ({ ctx, next }) => {
  await consumeLimiterForTRPC(
    globalRequestLimit,
    ctx.injector.get(sessionIdContext),
  );
  return next({ ctx });
});

export const t = {
  router: trpc.router,
  procedure: trpc.procedure.use(globalMiddleware),
  middleware: trpc.middleware,
};
