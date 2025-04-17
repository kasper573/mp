import { InjectionContext, type InjectionContainer } from "@mp/ioc";
import type { RpcFactories, RpcMiddleware } from "@mp/rpc";
import { RpcBuilder, type RpcErrorFormatter } from "@mp/rpc";

export const ctxGlobalMiddleware = InjectionContext.new<GameRpcMiddleware>();

export const ctxRpcErrorFormatter =
  InjectionContext.new<GameRpcErrorFormatter>();

export const rpc = buildRpc();

export type GameRpcContext = InjectionContainer;

export type GameRpcErrorFormatter = RpcErrorFormatter<GameRpcContext>;

export type GameRpcMiddleware = RpcMiddleware<GameRpcContext, unknown, unknown>;

function buildRpc(): RpcFactories<GameRpcContext> {
  const rpc = new RpcBuilder().context<GameRpcContext>().build();

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
