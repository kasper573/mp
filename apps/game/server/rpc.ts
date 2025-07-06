import { InjectionContext, type ImmutableInjectionContainer } from "@mp/ioc";
import type { RpcFactories, RpcMiddleware } from "@mp/rpc";
import { RpcBuilder } from "@mp/rpc";

export const ctxGlobalMiddleware =
  InjectionContext.new<GameRpcMiddleware>("GlobalMiddleware");

export const rpc = buildRpc();

export type GameRpcContext = ImmutableInjectionContainer;

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
