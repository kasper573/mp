import { createRPCHook } from "@mp/rpc";
import {
  areaRouterSlice,
  npcRouterSlice,
  characterRouterSlice,
} from "./server";
import { rpc } from "./rpc";

export const gameRpcSlice = {
  ...characterRouterSlice,
  ...areaRouterSlice,
  ...npcRouterSlice,
};

export const useRPC = createRPCHook(rpc.router(gameRpcSlice));
