import { worldRouterSlice } from "./world/rpc";
import { areaRouterSlice, npcRouterSlice, characterRouterSlice } from ".";

export const gameServerRpcSlice = {
  ...characterRouterSlice,
  ...worldRouterSlice,
  ...areaRouterSlice,
  ...npcRouterSlice,
};
