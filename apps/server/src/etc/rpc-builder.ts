import { InjectionContext, type ImmutableInjectionContainer } from "@mp/ioc";
import type { RpcFactories, RpcMiddleware } from "@mp/rpc";
import { RpcBuilder } from "@mp/rpc";

export const ctxGlobalRpcMiddleware = InjectionContext.new<ApiRpcMiddleware>(
  "GlobalRpcMiddleware",
);

export const rpc = buildRpc();

export type ApiRpcContext = ImmutableInjectionContainer;

export type ApiRpcMiddleware = RpcMiddleware<ApiRpcContext, unknown, unknown>;

function buildRpc(): RpcFactories<ApiRpcContext> {
  const rpc = new RpcBuilder().context<ApiRpcContext>().build();

  const globalMiddleware = rpc.middleware((opt) => {
    const middleware = opt.ctx.get(ctxGlobalRpcMiddleware);
    return middleware(opt);
  });

  return {
    router: rpc.router,
    procedure: rpc.procedure.use(globalMiddleware),
    middleware: rpc.middleware,
  };
}
