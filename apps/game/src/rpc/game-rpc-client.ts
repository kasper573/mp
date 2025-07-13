import type { RouterNode } from "@mp/rpc";
import type { ReactRpcInvoker } from "@mp/rpc/react";
import { InjectionContext } from "@mp/ioc";
import type { gameServerRpcSlice } from "./rpc-definition.slice";

export const ctxGameRpcClient =
  InjectionContext.new<GameRpcClient>("GameRpcClient");

export type GameRpcClient = ReactRpcInvoker<
  RouterNode<typeof gameServerRpcSlice>
>;
