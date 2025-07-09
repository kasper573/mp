import type { RouterNode } from "@mp/rpc";
import type { SolidRpcInvoker } from "@mp/rpc/solid";
import { InjectionContext } from "@mp/ioc";
import type { gameServerRpcSlice } from "../server/rpc.slice";

export const ctxGameRpcClient =
  InjectionContext.new<GameRpcClient>("GameRpcClient");

export type GameRpcClient = SolidRpcInvoker<
  RouterNode<typeof gameServerRpcSlice>
>;
