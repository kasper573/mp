import { initTRPC } from "@trpc/server";
import { InjectionContext, type InjectionContainer } from "@mp/ioc";
import type {
  DefaultErrorShape,
  ErrorFormatter,
  MiddlewareFunction,
} from "@trpc/server/unstable-core-do-not-import";
import { transformer } from "../shared";

export const ctxGlobalMiddleware = InjectionContext.new<AnyMiddleware>();

export const ctxTrpcErrorFormatter = InjectionContext.new<AnyErrorFormatter>();

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
    errorFormatter: (opt) => opt.ctx?.ioc.get(ctxTrpcErrorFormatter)(opt),
  });

  const globalMiddleware = trpc.middleware(async (opt) => {
    const middleware = opt.ctx.ioc.get(ctxGlobalMiddleware);
    return middleware(opt);
  });

  return {
    router: trpc.router,
    procedure: trpc.procedure.use(globalMiddleware),
    middleware: trpc.middleware,
  };
}

export interface TRPCContext {
  ioc: InjectionContainer;
}

export type AnyErrorFormatter = ErrorFormatter<TRPCContext, DefaultErrorShape>;

export type AnyMiddleware = MiddlewareFunction<
  TRPCContext,
  object,
  unknown,
  unknown,
  unknown
>;
