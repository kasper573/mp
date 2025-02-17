import { initTRPC } from "@trpc/server";
import { transformer } from "./shared";
import type { ServerContext } from "./context";
import { consumeLimiterForTRPC } from "./middlewares/rateLimit";
import { createRateLimiter } from "./createRateLimiter";

const trpc = initTRPC.context<ServerContext>().create({
  transformer,
  errorFormatter: ({ shape, ctx }) => {
    if (ctx?.exposeErrorDetails) {
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
  await consumeLimiterForTRPC(globalRequestLimit, ctx);
  return next({ ctx });
});

export const t = {
  router: trpc.router,
  procedure: trpc.procedure.use(globalMiddleware),
  middleware: trpc.middleware,
};
