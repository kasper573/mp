import type { ImmutableInjectionContainer } from "@mp/ioc";
import type { RpcMiddleware } from "@mp/rpc";
import { RpcBuilder } from "@mp/rpc";

export const rpc = new RpcBuilder().context<ApiContext>().build();

export type ApiContext = ImmutableInjectionContainer;

export type ApiMiddleware = RpcMiddleware<ApiContext, unknown, unknown>;
