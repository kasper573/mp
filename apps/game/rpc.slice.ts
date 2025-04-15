import type { RouterNode, SolidRPCInvoker } from "@mp/rpc";
import { createContext, useContext } from "solid-js";
import {
  areaRouterSlice,
  npcRouterSlice,
  characterRouterSlice,
} from "./server";

export const gameRpcSlice = {
  ...characterRouterSlice,
  ...areaRouterSlice,
  ...npcRouterSlice,
};

type SliceApi = SolidRPCInvoker<RouterNode<typeof gameRpcSlice>>;

export function useRPC() {
  const rpc = useContext(GameRPCSliceApiContext);
  if (!rpc) {
    throw new Error("useRPC must be used within a GameRPCProvider");
  }
  return rpc;
}

export const GameRPCSliceApiContext = createContext<SliceApi>();
