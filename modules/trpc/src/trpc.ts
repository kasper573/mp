import { initTRPC } from "@trpc/server";
import { InjectionContext, type Injector } from "@mp/injector";
import type {
  DefaultErrorShape,
  ErrorFormatter,
  MiddlewareFunction,
} from "@trpc/server/unstable-core-do-not-import";
import { transformer } from "../transformer";

export const ctx_exposeErrorDetails = InjectionContext.new<boolean>();

export const ctx_globalMiddleware = InjectionContext.new<AnyMiddleware>();

export const ctx_trpcErrorFormatter = InjectionContext.new<AnyErrorFormatter>();

// We don't really care for runtime validation, but since trpc requires a parse
// function instead of allowing simply a type, we use this factory for a
// convenient way to define noop schemas given a typescript type.
export const schemaFor = <T>() => ({ parse: (input: unknown) => input as T });

export const t = createInjectableTRPC();

export { TRPCError } from "@trpc/server";

export * as trpcExpress from "@trpc/server/adapters/express";

function createInjectableTRPC() {
  const trpc = initTRPC.context<TRPCContext>().create({
    transformer,
    errorFormatter: (opt) => opt.ctx?.injector.get(ctx_trpcErrorFormatter)(opt),
  });

  const globalMiddleware = trpc.middleware(async (opt) => {
    const middleware = opt.ctx.injector.get(ctx_globalMiddleware);
    return middleware(opt);
  });

  return {
    router: trpc.router,
    procedure: trpc.procedure.use(globalMiddleware),
    middleware: trpc.middleware,
  };
}

export interface TRPCContext {
  injector: Injector;
}

export type AnyErrorFormatter = ErrorFormatter<TRPCContext, DefaultErrorShape>;

export type AnyMiddleware = MiddlewareFunction<
  TRPCContext,
  object,
  unknown,
  unknown,
  unknown
>;
