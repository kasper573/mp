import { worldRouterSlice } from "./world/rpc";
import { assetsRouterSlice, npcRouterSlice, characterRouterSlice } from ".";

export const gameServerRpcSlice = {
  ...characterRouterSlice,
  ...worldRouterSlice,
  ...assetsRouterSlice,
  ...npcRouterSlice,
};
