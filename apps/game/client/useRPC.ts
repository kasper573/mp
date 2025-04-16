import type { SolidRPCInvoker, RouterNode } from "@mp/rpc";
import { createContext, useContext } from "solid-js";
import type { gameRpcSlice } from "../server/rpc.slice";

export function useRPC() {
  const rpc = useContext(GameRPCSliceApiContext);
  if (!rpc) {
    throw new Error("useRPC must be used within a GameRPCProvider");
  }
  return rpc;
}

export const GameRPCSliceApiContext = createContext<GameSolidRPCInvoker>();

export type GameSolidRPCInvoker = SolidRPCInvoker<
  RouterNode<typeof gameRpcSlice>
>;
