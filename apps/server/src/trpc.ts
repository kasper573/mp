import { initTRPC } from "@trpc/server";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { transformer } from "./shared.ts";
import type { ServerContext } from "./context.ts";
import { consumeLimiterWithContext } from "./middlewares/rateLimit.ts";

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

const globalRequestLimit = new RateLimiterMemory({
  points: 20,
  duration: 1,
});

const globalMiddleware = trpc.middleware(async ({ ctx, next }) => {
  await consumeLimiterWithContext(globalRequestLimit, ctx);
  return next({ ctx });
});

export const t = {
  router: trpc.router,
  procedure: trpc.procedure.use(globalMiddleware),
  middleware: trpc.middleware,
};
