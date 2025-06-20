import type { AuthToken } from "@mp/auth";
import { InjectionContext, type InjectionContainer } from "@mp/ioc";
import type { RpcFactories, RpcMiddleware } from "@mp/rpc";
import { RpcBuilder } from "@mp/rpc";

export const ctxGlobalMiddleware =
  InjectionContext.new<GameRpcMiddleware>("GlobalMiddleware");

export const rpc = buildRpc();

export type GameRpcContext = InjectionContainer;

export interface GameRpcHeaders {
  authToken?: AuthToken;
}

export type GameRpcMiddleware = RpcMiddleware<
  GameRpcContext,
  unknown,
  unknown,
  GameRpcHeaders
>;

function buildRpc(): RpcFactories<GameRpcContext, GameRpcHeaders> {
  const rpc = new RpcBuilder()
    .context<GameRpcContext>()
    .headers<GameRpcHeaders>()
    .build();

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
