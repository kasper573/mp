import { InjectionContext, type InjectionContainer } from "@mp/ioc";
import type { RPCFactories, RPCMiddleware } from "@mp/rpc";
import { RPCBuilder, type RPCErrorFormatter } from "@mp/rpc";

export const ctxGlobalMiddleware = InjectionContext.new<GameRPCMiddleware>();

export const ctxRpcErrorFormatter =
  InjectionContext.new<GameRPCErrorFormatter>();

export const rpc = buildRPC();

export type GameRPCContext = InjectionContainer;

export type GameRPCErrorFormatter = RPCErrorFormatter<GameRPCContext>;

export type GameRPCMiddleware = RPCMiddleware<GameRPCContext, unknown, unknown>;

function buildRPC(): RPCFactories<GameRPCContext> {
  const rpc = new RPCBuilder().context<GameRPCContext>().build();

  const globalMiddleware = rpc.middleware((opt) => {
    const middleware = opt.ctx.get(ctxGlobalMiddleware);
    return middleware(opt);
  });

  return {
    router: rpc.router,
    procedure: rpc.procedure.use(globalMiddleware),
    middleware: rpc.middleware,
  };
}
