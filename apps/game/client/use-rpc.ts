import type { SolidRpcInvoker, RouterNode } from "@mp/rpc";
import { createContext, useContext } from "solid-js";
import type { gameRpcSlice } from "../server/rpc.slice";

export function useRpc() {
  const rpc = useContext(GameRpcSliceApiContext);
  if (!rpc) {
    throw new Error("useRpc must be used within a GameRpcProvider");
  }
  return rpc;
}

export const GameRpcSliceApiContext = createContext<GameSolidRpcInvoker>();

export type GameSolidRpcInvoker = SolidRpcInvoker<
  RouterNode<typeof gameRpcSlice>
>;
