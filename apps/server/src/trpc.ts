import { initTRPC } from "@trpc/server";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { transformer } from "./transformer";
import type { ServerContext } from "./context";
import { consumeLimiterWithContext } from "./middlewares/rateLimit";

const trpc = initTRPC.context<ServerContext>().create({ transformer });

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
